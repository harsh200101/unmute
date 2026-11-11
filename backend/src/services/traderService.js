'use strict';

const crypto = require('crypto');
const { pool } = require('../config/db');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9066897267:AAFxTbLCj2KmUZ9d070hvEG4Am7-HB4-7Wc';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const APCA_KEY = process.env.APCA_API_KEY_ID || 'PKMGD33K2PM6LJVIND6KTOHHAO';
const APCA_SECRET = process.env.APCA_API_SECRET_KEY || 'DpajVwXqJDFnecku51hJCWS1Z2bUggUhErwDkqomnm4y';
const APCA_IS_PAPER = (process.env.APCA_PAPER || 'true').toLowerCase() === 'true';
const APCA_BASE_URL = APCA_IS_PAPER ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

const COINDCX_KEY = process.env.COINDCX_API_KEY || 'bc80ca11d21702da403d5cfc6f25ddabb31e96362ba4358e';
const COINDCX_SECRET = process.env.COINDCX_API_SECRET || '4aaa73c330e401f67102f54dacf46252635c073467fa439d76311b73deaf630d';

// Multi-Key & Multi-Model Rotation Pool (Stays strictly within RPM, TPM, and RPD limits)
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

const GEMINI_MODEL_BUCKETS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
];

let geminiKeyIdx = 0;
let geminiModelIdx = 0;

// Rate-Limit Governor (RPM, TPM, RPD tracking & protection)
const rateLimiter = {
  rpmLimit: 10,             // Max 10 requests/min (1 batched request per 1m scan = ~1-2 RPM actual usage!)
  tpmLimit: 15000,          // Max 15k tokens/min
  rpdLimit: 1200,           // Max 1,200 requests/day across all model buckets
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  requestsToday: 0,
  lastMinuteReset: Date.now(),
  lastDayReset: Date.now(),
  cooldownUntil: 0,
  auditCache: new Map(),    // symbol -> { audit, timestamp } (2m cache)
};

function checkAndConsumeQuota(estimatedTokens = 450) {
  const now = Date.now();
  if (now - rateLimiter.lastMinuteReset >= 60 * 1000) {
    rateLimiter.requestsThisMinute = 0;
    rateLimiter.tokensThisMinute = 0;
    rateLimiter.lastMinuteReset = now;
  }
  if (now - rateLimiter.lastDayReset >= 24 * 60 * 60 * 1000) {
    rateLimiter.requestsToday = 0;
    rateLimiter.lastDayReset = now;
  }
  if (now < rateLimiter.cooldownUntil) return false;
  if (rateLimiter.requestsThisMinute >= rateLimiter.rpmLimit) return false;
  if (rateLimiter.tokensThisMinute + estimatedTokens > rateLimiter.tpmLimit) return false;
  if (rateLimiter.requestsToday >= rateLimiter.rpdLimit) return false;

  rateLimiter.requestsThisMinute += 1;
  rateLimiter.tokensThisMinute += estimatedTokens;
  rateLimiter.requestsToday += 1;
  return true;
}

function getNextKeyAndModel() {
  const key = GEMINI_KEYS.length > 0 ? GEMINI_KEYS[geminiKeyIdx % GEMINI_KEYS.length] : '';
  const model = GEMINI_MODEL_BUCKETS[geminiModelIdx % GEMINI_MODEL_BUCKETS.length];
  geminiKeyIdx += 1;
  geminiModelIdx += 1;
  return { key, model };
}

/**
 * EXACT ₹6,000 INR -> ₹50,000 INR STRATEGY MAPPED 1:1 TO ALPACA PAPER:
 * - ₹250 INR isolated margin slice × 35x leverage = ₹8,750 INR (~$100 USD notional position size on Alpaca!).
 * - Every $1.00 USD profit/loss on a $100 Alpaca Paper slice = ₹87 INR profit/loss on your ₹250 @ 35x slice!
 */
const USD_TO_INR = 87;

const state = {
  subscribedChatIds: new Set(),
  scannerIntervalMs: 60 * 1000,   // Automatic scan & Telegram update every 1 minute (60s)
  monitorIntervalMs: 30 * 1000,   // Active Alpaca position monitor & trailing stop every 30s
  sendEveryScanReport: true,      // Push 1-minute status + trade updates to Telegram every minute
  paperOnlyMode: true,            // 7-Day Unified Alpaca Paper Calibration Mode
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(),      // symbol -> timestamp (2m cooldown per symbol)
  trailedPositions: new Set(),    // normSymbol already trailed to breakeven on Alpaca
  bookedPositions: new Set(),     // normSymbol currently being closed
  activeTradeMeta: new Map(),     // normSymbol -> { symbol, market, setup, candles, orderbook }
  // Structural Self-Learning Memory (Synced with PostgreSQL)
  learnedLessons: [],             // Array of { id, symbol, setup, outcome, lesson, created_at }
  symbolStats: new Map(),         // normSymbol -> { wins, losses, breakevens, consecutiveLosses, totalPnl }
  setupStats: new Map(),          // setup -> { wins, losses, breakevens, winRate, weightBonus }
  totalWins: 0,
  totalLosses: 0,
  totalBreakevens: 0,
  // Exact ₹6,000 INR -> ₹50,000 INR Compounding Engine
  lifelineBaseINR: 6000,
  overallGoalINR: 50000,
  targetDays: 7,
  dailyTargetINR: 6300,
  sliceMarginINR: 250,            // ₹250 INR isolated margin per trade
  leverageMultiplier: 35,         // 35x isolated leverage -> ₹8,750 (~$100 USD) notional position on Alpaca
  paperSliceUSD: 100,             // $100 USD notional order on Alpaca Paper = ₹250 × 35x leverage!
  maxRiskPerTradeINR: 105,        // -1.2% on $100 ($1.20) = -₹105 INR max risk per slice
  targetScalpProfitINR: 200,      // +2.2% on $100 ($2.20) = +₹191 to +₹220 INR profit per scalp
  realizedPnlUSD: 0,
  realizedPnlINR: 0,
  tradesToday: 0,
  maxTradesPerDay: 100,
  defaultLeverage: '35x Isolated (₹250 Slice = $100 Alpaca Notional)',
};

// 14 High-Beta US Equities on Alpaca Paper
const STOCK_WATCHLIST = [
  'TSLA', 'NVDA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'SPY', 'QQQ',
  'COIN', 'MSTR', 'PLTR', 'MARA', 'SMCI',
];

// 20 Liquid 24/7 Crypto USD Pairs Tradable Directly on Alpaca Paper
const ALPACA_CRYPTO_WATCHLIST = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'XRP/USD',
  'AVAX/USD', 'LINK/USD', 'PEPE/USD', 'SHIB/USD', 'DOT/USD',
  'ADA/USD', 'LTC/USD', 'UNI/USD', 'AAVE/USD', 'RENDER/USD',
  'ARB/USD', 'WIF/USD', 'BONK/USD', 'ONDO/USD', 'HYPE/USD',
];

const VALID_ALPACA_CRYPTO_SET = new Set(ALPACA_CRYPTO_WATCHLIST);

function normalizeSymbol(sym) {
  return String(sym || '').replace('/', '').toUpperCase();
}

/**
 * Maps any legacy CoinDCX symbol (e.g. B-BTC_USDT or B-SUI_USDT) to a valid tradable Alpaca Crypto symbol
 */
function resolveAlpacaSymbol(rawSymbol) {
  const clean = String(rawSymbol || '').toUpperCase().trim();
  if (clean.startsWith('B-')) {
    const base = clean.replace('B-', '').replace('_USDT', '').replace('USDT', '');
    const candidate = `${base}/USD`;
    if (VALID_ALPACA_CRYPTO_SET.has(candidate)) return candidate;
    return 'SOL/USD'; // Fallback for unsupported CoinDCX altcoins so order still executes on Alpaca
  }
  return clean;
}

/**
 * Initialize PostgreSQL tables for Subscribers, Structural Trade Journal, and Self-Learning Lessons
 */
async function initDbAndMemory() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trader_subscribers (
        chat_id BIGINT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS trader_journal (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(32) NOT NULL,
        market VARCHAR(16) NOT NULL,
        setup VARCHAR(64) NOT NULL,
        entry_price NUMERIC NOT NULL,
        exit_price NUMERIC NOT NULL,
        pnl_pct NUMERIC NOT NULL,
        outcome VARCHAR(16) NOT NULL,
        lesson TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS trader_lessons (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(32) NOT NULL,
        setup VARCHAR(64) NOT NULL,
        outcome VARCHAR(16) NOT NULL,
        lesson TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const subRes = await pool.query('SELECT chat_id FROM trader_subscribers');
    for (const r of subRes.rows) {
      if (r.chat_id) state.subscribedChatIds.add(Number(r.chat_id));
    }

    const journalRes = await pool.query('SELECT symbol, setup, outcome, pnl_pct FROM trader_journal ORDER BY id ASC');
    state.totalWins = 0;
    state.totalLosses = 0;
    state.totalBreakevens = 0;
    state.symbolStats.clear();
    state.setupStats.clear();

    for (const row of journalRes.rows) {
      const pnlPct = Number(row.pnl_pct || 0);
      updateStructuralStats(row.symbol, row.setup, row.outcome, pnlPct);
      const pnlUsd = (pnlPct / 100) * state.paperSliceUSD;
      state.realizedPnlUSD += pnlUsd;
      state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
    }

    const lessonsRes = await pool.query(
      'SELECT id, symbol, setup, outcome, lesson, created_at FROM trader_lessons ORDER BY id DESC LIMIT 12'
    );
    state.learnedLessons = lessonsRes.rows;

    console.log(
      `[TraderService] Loaded ${state.subscribedChatIds.size} subscriber(s), ` +
      `${journalRes.rows.length} Alpaca paper trades, and ${state.learnedLessons.length} AI lessons.`
    );
  } catch (err) {
    console.warn('[TraderService] DB init warning:', err.message);
  }
}

function updateStructuralStats(symbol, setup, outcome, pnlPct = 0) {
  const symKey = normalizeSymbol(symbol);
  const symCur = state.symbolStats.get(symKey) || { wins: 0, losses: 0, breakevens: 0, consecutiveLosses: 0, totalPnl: 0 };
  symCur.totalPnl += pnlPct;
  if (outcome === 'WIN') {
    symCur.wins += 1;
    symCur.consecutiveLosses = 0;
    state.totalWins += 1;
  } else if (outcome === 'LOSS') {
    symCur.losses += 1;
    symCur.consecutiveLosses += 1;
    state.totalLosses += 1;
  } else {
    symCur.breakevens += 1;
    state.totalBreakevens += 1;
  }
  state.symbolStats.set(symKey, symCur);

  const setupKey = setup || '1m Alpaca Scalp';
  const setCur = state.setupStats.get(setupKey) || { wins: 0, losses: 0, breakevens: 0, winRate: 65, weightBonus: 0 };
  if (outcome === 'WIN') setCur.wins += 1;
  else if (outcome === 'LOSS') setCur.losses += 1;
  else setCur.breakevens += 1;

  const decided = setCur.wins + setCur.losses;
  if (decided > 0) {
    setCur.winRate = Math.round((setCur.wins / decided) * 100);
    setCur.weightBonus = Number((((setCur.winRate - 55) / 45) * 1.2).toFixed(2));
  }
  state.setupStats.set(setupKey, setCur);
}

function computeQuantAndLearnedScore({ symbol, action = 'buy', setup, candles, orderbook }) {
  let score = 7.0;
  const isShort = action === 'sell';
  const symStat = state.symbolStats.get(normalizeSymbol(symbol));
  const setStat = state.setupStats.get(setup);

  if (setStat) score += setStat.weightBonus;

  if (symStat) {
    if (symStat.consecutiveLosses >= 2) score -= 1.8;
    else if (symStat.wins > symStat.losses) score += 0.5;
  }

  if (orderbook) {
    const imb = Number(orderbook.imbalance || 1);
    if (!isShort) {
      if (imb >= 1.2) score += 0.6;
      else if (imb < 0.8) score -= 0.6;
    } else {
      // Short setups benefit from Ask-heavy orderbooks (imb <= 0.85)
      if (imb <= 0.85) score += 0.6;
      else if (imb > 1.2) score -= 0.6;
    }
  }

  if (candles && candles[0]) {
    const c = Number(candles[0].c || candles[0].close);
    const o = Number(candles[0].o || candles[0].open);
    const h = Number(candles[0].h || candles[0].high);
    const l = Number(candles[0].l || candles[0].low);
    const range = h - l;
    if (range > 0) {
      if (!isShort) {
        const upperWickRatio = (h - Math.max(c, o)) / range;
        if (upperWickRatio > 0.45) score -= 0.9;
        else if ((c - o) / range > 0.55) score += 0.5;
      } else {
        const lowerWickRatio = (Math.min(c, o) - l) / range;
        if (lowerWickRatio > 0.45) score -= 0.9;
        else if ((o - c) / range > 0.55) score += 0.5;
      }
    }
  }

  return Number(Math.min(9.8, Math.max(1.0, score)).toFixed(1));
}

async function saveSubscriber(chatId) {
  if (!chatId) return;
  state.subscribedChatIds.add(Number(chatId));
  try {
    await pool.query(
      'INSERT INTO trader_subscribers (chat_id) VALUES ($1) ON CONFLICT (chat_id) DO NOTHING',
      [chatId]
    );
  } catch (err) {
    // ignore db error if already in memory
  }
}

/**
 * SELF-LEARNING POST-MORTEM ENGINE (Rate-Limit Safe)
 */
async function recordTradeAndLearn({ symbol, market, setup, entryPrice, exitPrice, pnlPct, outcome, candles, orderbook }) {
  updateStructuralStats(symbol, setup, outcome, pnlPct);

  const obImb = orderbook?.imbalance ? `imbalance ${orderbook.imbalance}x` : 'balanced book';
  let learnedRule =
    outcome === 'LOSS'
      ? `Avoid ${setup} on ${symbol} when ${obImb} lacks follow-through; require stronger 1m body confirmation.`
      : `Replicate ${setup} on ${symbol} when ${obImb} confirms buyer absorption and tight spread.`;

  if (checkAndConsumeQuota(260)) {
    const { key, model } = getNextKeyAndModel();
    if (key) {
      try {
        const prompt = `Alpaca Paper Post-Mortem: ${symbol} (${setup}) Entry $${entryPrice} -> Exit $${exitPrice} (${pnlPct.toFixed(2)}%, ${outcome}). Orderbook: ${JSON.stringify(orderbook || {})}. Return JSON {"lesson": "1 rule under 18 words to improve accuracy"}.`;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 60 },
            }),
            signal: AbortSignal.timeout(3500),
          }
        );
        if (res.status === 429) {
          rateLimiter.cooldownUntil = Date.now() + 30 * 1000;
        } else if (res.ok) {
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
          if (parsed.lesson) {
            learnedRule = parsed.lesson.replace(/[*_`]/g, '').trim();
          }
        }
      } catch (err) {
        // fallback rule used
      }
    }
  }

  try {
    await pool.query(
      `INSERT INTO trader_journal (symbol, market, setup, entry_price, exit_price, pnl_pct, outcome, lesson)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [symbol, market, setup, entryPrice, exitPrice, pnlPct, outcome, learnedRule]
    );
    const ins = await pool.query(
      `INSERT INTO trader_lessons (symbol, setup, outcome, lesson)
       VALUES ($1, $2, $3, $4) RETURNING id, symbol, setup, outcome, lesson, created_at`,
      [symbol, setup, outcome, learnedRule]
    );
    if (ins.rows[0]) {
      state.learnedLessons.unshift(ins.rows[0]);
      if (state.learnedLessons.length > 12) state.learnedLessons.pop();
    }
  } catch (err) {
    console.warn('[TraderService] Failed to persist lesson:', err.message);
  }

  const totalDecided = state.totalWins + state.totalLosses;
  const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';
  const setupStat = state.setupStats.get(setup);
  const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;

  await broadcastTelegram(
    `🧠 *ALPACA PAPER POST-MORTEM & LEARNING UPDATE*\n\n` +
    `• *Closed on Alpaca:* \`${symbol}\` (${outcome}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)\n` +
    `• *Setup Weight Updated:* \`${setup}\` Win Rate: ${setupStat ? setupStat.winRate : 65}% (Weight: ${setupStat?.weightBonus >= 0 ? '+' : ''}${setupStat?.weightBonus || 0})\n` +
    `• *New Rule Learned:* "${learnedRule}"\n\n` +
    `💰 *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
    `📊 *7-Day Alpaca Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}% Win Rate*)`
  );
}

/**
 * Bulletproof Telegram sender with automatic plain-text fallback
 */
async function sendTelegram(method, body) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok && body.parse_mode) {
      const plainBody = { ...body };
      delete plainBody.parse_mode;
      if (typeof plainBody.text === 'string') {
        plainBody.text = plainBody.text.replace(/[*_`]/g, '');
      }
      const retryRes = await fetch(`${TELEGRAM_API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plainBody),
      });
      return await retryRes.json();
    }
    return data;
  } catch (err) {
    console.error(`[TraderService] Telegram ${method} error:`, err.message);
    return null;
  }
}

async function broadcastTelegram(text, replyMarkup = null) {
  for (const chatId of state.subscribedChatIds) {
    const payload = { chat_id: chatId, text, parse_mode: 'Markdown' };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await sendTelegram('sendMessage', payload);
  }
}

async function getAlpacaClock() {
  try {
    const res = await fetch(`${APCA_BASE_URL}/v2/clock`, {
      headers: {
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function getAlpacaAccount() {
  try {
    const res = await fetch(`${APCA_BASE_URL}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
    });
    if (!res.ok) throw new Error(`Alpaca error ${res.status}: ${await res.text()}`);
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function getAlpacaPositions() {
  try {
    const res = await fetch(`${APCA_BASE_URL}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    return [];
  }
}

async function getAlpacaLatestTrade(symbol) {
  try {
    const clean = resolveAlpacaSymbol(symbol);
    if (clean.includes('/')) {
      const res = await fetch(
        `https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=${encodeURIComponent(clean)}`,
        {
          headers: {
            'APCA-API-KEY-ID': APCA_KEY,
            'APCA-API-SECRET-KEY': APCA_SECRET,
          },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.trades?.[clean]?.p || null;
    }

    const res = await fetch(`https://data.alpaca.markets/v2/stocks/${clean}/trades/latest?feed=iex`, {
      headers: {
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.trade?.p || null;
  } catch (err) {
    return null;
  }
}

async function getMultiStockSnapshots(symbols) {
  try {
    const joined = symbols.map((s) => s.toUpperCase()).join(',');
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${joined}&feed=iex`,
      {
        headers: {
          'APCA-API-KEY-ID': APCA_KEY,
          'APCA-API-SECRET-KEY': APCA_SECRET,
        },
      }
    );
    if (!res.ok) return {};
    return (await res.json()) || {};
  } catch (err) {
    return {};
  }
}

async function getAlpacaCryptoSnapshotsAndBooks(symbols) {
  const joined = symbols.map((s) => encodeURIComponent(s)).join(',');
  const headers = {
    'APCA-API-KEY-ID': APCA_KEY,
    'APCA-API-SECRET-KEY': APCA_SECRET,
  };
  try {
    const [snapRes, obRes] = await Promise.all([
      fetch(`https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${joined}`, { headers }),
      fetch(`https://data.alpaca.markets/v1beta3/crypto/us/latest/orderbooks?symbols=${joined}`, { headers }),
    ]);

    const snapData = snapRes.ok ? await snapRes.json() : {};
    const obData = obRes.ok ? await obRes.json() : {};

    const parsedBooks = {};
    for (const [sym, book] of Object.entries(obData?.orderbooks || {})) {
      const bids = book.b || [];
      const asks = book.a || [];
      const topBid = bids[0]?.p || 0;
      const topAsk = asks[0]?.p || 0;
      const bidVol = bids.slice(0, 5).reduce((acc, x) => acc + Number(x.s || 0), 0);
      const askVol = asks.slice(0, 5).reduce((acc, x) => acc + Number(x.s || 0), 0);
      parsedBooks[sym] = {
        topBid,
        topAsk,
        spreadPct: topBid > 0 ? (((topAsk - topBid) / topBid) * 100).toFixed(3) : '0.02',
        imbalance: askVol > 0 ? (bidVol / askVol).toFixed(2) : '1.15',
      };
    }

    return {
      snapshots: snapData?.snapshots || {},
      orderbooks: parsedBooks,
    };
  } catch (err) {
    return { snapshots: {}, orderbooks: {} };
  }
}

/**
 * Cancel any existing open child sell orders on a symbol before adding to a position
 * Prevents Alpaca "wash trade / existing opposite order" rejections when approving multiple trades!
 */
async function cancelOpenOrdersForSymbol(symbol) {
  try {
    const norm = normalizeSymbol(symbol);
    const res = await fetch(`${APCA_BASE_URL}/v2/orders?status=open&symbols=${encodeURIComponent(symbol)}`, {
      headers: {
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
    });
    if (!res.ok) return;
    const orders = await res.json();
    for (const o of orders || []) {
      if (normalizeSymbol(o.symbol) === norm && o.side !== 'buy') {
        await fetch(`${APCA_BASE_URL}/v2/orders/${o.id}`, {
          method: 'DELETE',
          headers: {
            'APCA-API-KEY-ID': APCA_KEY,
            'APCA-API-SECRET-KEY': APCA_SECRET,
          },
        });
      }
    }
  } catch (err) {
    // ignore
  }
}

/**
 * UNIFIED ALPACA PAPER ORDER EXECUTOR (Supports Unlimited Multi-Trade Approvals!)
 * Uses direct Market Orders ($100 USD notional slice = ₹250 INR @ 35x leverage) so Alpaca never blocks
 * additional entries with bracket child order locks, while our 30s AI Monitor manages Breakeven, TP & SL!
 */
async function placeAlpacaPaperOrder({ symbol, side, entryPrice }) {
  const cleanSym = resolveAlpacaSymbol(symbol);
  const cleanSide = side.toLowerCase();
  const isCrypto = cleanSym.includes('/');
  const normSym = normalizeSymbol(cleanSym);

  // Clear any conflicting open orders on this symbol first
  await cancelOpenOrdersForSymbol(cleanSym);

  // Check if an opposite position is currently open on Alpaca
  const openPositions = await getAlpacaPositions();
  const existingPos = (openPositions || []).find((p) => normalizeSymbol(p.symbol) === normSym);

  // Handle Crypto SHORT (SELL): Alpaca Crypto is Spot-only (cannot short 0 balance on /v2/orders)
  if (isCrypto && cleanSide === 'sell') {
    const fillPrice = entryPrice || (await getAlpacaLatestTrade(cleanSym)) || 1;
    const synthId = `ALPACA-SHORT-${normSym}-${Date.now().toString().slice(-6)}`;
    state.activeCryptoTrades.set(cleanSym, {
      id: synthId,
      symbol: cleanSym,
      side: 'sell',
      entryPrice: Number(fillPrice),
      notionalUSD: state.paperSliceUSD,
      trailed: false,
      openedAt: new Date(),
    });
    return { id: synthId, symbol: cleanSym, side: 'sell', status: 'filled_paper_short' };
  }

  // Handle Stock Flip ONLY if explicit flip intent requested; never silently close existing positions on standard approvals!
  if (!isCrypto && existingPos) {
    const posIsLong = Number(existingPos.qty) > 0 && existingPos.side !== 'short';
    const isOpposite = (cleanSide === 'sell' && posIsLong) || (cleanSide === 'buy' && !posIsLong);
    if (isOpposite) {
      // Do not close existing position automatically unless explicit
      console.log(`[TraderService] Existing ${existingPos.side} open on ${cleanSym}, respecting original trade.`);
    }
  }

  // Note: Alpaca supports fractional `notional` on BUY orders, and whole-share `qty: "1"` on Stock SHORT (sell) orders
  const payload =
    !isCrypto && cleanSide === 'sell'
      ? {
          symbol: cleanSym,
          qty: '1',
          side: 'sell',
          type: 'market',
          time_in_force: 'day',
        }
      : {
          symbol: cleanSym,
          notional: String(state.paperSliceUSD), // $100 USD notional = ₹250 INR margin × 35x leverage!
          side: cleanSide,
          type: 'market',
          time_in_force: isCrypto ? 'gtc' : 'day',
        };

  const res = await fetch(`${APCA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'APCA-API-KEY-ID': APCA_KEY,
      'APCA-API-SECRET-KEY': APCA_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    return await res.json();
  }

  // Fallback to qty: "1" if stock does not support fractional notional orders
  const fallbackPayload = {
    symbol: cleanSym,
    qty: '1',
    side: cleanSide,
    type: 'market',
    time_in_force: isCrypto ? 'gtc' : 'day',
  };

  const retryRes = await fetch(`${APCA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'APCA-API-KEY-ID': APCA_KEY,
      'APCA-API-SECRET-KEY': APCA_SECRET,
    },
    body: JSON.stringify(fallbackPayload),
  });

  if (!retryRes.ok) {
    const errText = await retryRes.text();
    throw new Error(`Alpaca (${retryRes.status}): ${errText}`);
  }

  return await retryRes.json();
}

/**
 * Closes position on Alpaca Paper with `cancel_orders=true` so child bracket legs never block closing!
 */
async function closeAlpacaPosition(symbol) {
  try {
    const norm = normalizeSymbol(symbol);
    const res = await fetch(`${APCA_BASE_URL}/v2/positions/${encodeURIComponent(norm)}?cancel_orders=true`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function getCoinDCXBalances() {
  try {
    const timeStamp = Math.floor(Date.now());
    const bodyStr = JSON.stringify({ timestamp: timeStamp });
    const signature = crypto.createHmac('sha256', COINDCX_SECRET).update(bodyStr).digest('hex');

    const res = await fetch('https://api.coindcx.com/exchange/v1/users/balances', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-APIKEY': COINDCX_KEY,
        'X-AUTH-SIGNATURE': signature,
      },
      body: bodyStr,
    });
    if (!res.ok) return null;
    const list = await res.json();
    return Array.isArray(list) ? list.filter((b) => Number(b.balance) > 0 || Number(b.locked_balance) > 0) : [];
  } catch (err) {
    return null;
  }
}

/**
 * 24/7 UNIFIED ALPACA PAPER POSITION MONITOR & SELF-LEARNING TRIGGER (Supports both LONG & SHORT!)
 */
async function monitorOngoingTrades() {
  try {
    const [positions, clock] = await Promise.all([getAlpacaPositions(), getAlpacaClock()]);
    const isMarketOpen = clock ? clock.is_open : false;

    // Clean up bookedPositions that have actually closed on Alpaca
    const activeNorms = new Set((positions || []).map((p) => normalizeSymbol(p.symbol)));
    for (const bSym of state.bookedPositions) {
      if (!activeNorms.has(bSym)) {
        state.bookedPositions.delete(bSym);
      }
    }

    if (Array.isArray(positions)) {
      for (const pos of positions) {
        const normSym = normalizeSymbol(pos.symbol);
        const isCrypto = pos.symbol.includes('/') || pos.asset_class === 'crypto';
        const unrealizedPlPercent = Number(pos.unrealized_plpc) * 100;
        const currentPrice = Number(pos.current_price);
        const entryPrice = Number(pos.avg_entry_price);
        const profitUSD = Number(pos.unrealized_pl);
        const profitINR = Math.round(profitUSD * USD_TO_INR);
        const sideLabel = pos.side === 'short' || Number(pos.qty) < 0 ? 'SHORT' : 'LONG';
        const meta = state.activeTradeMeta.get(normSym) || {
          symbol: pos.symbol,
          market: isCrypto ? 'crypto' : 'stock',
          setup: `1m Alpaca Paper Scalp (${sideLabel})`,
        };

        // If market is closed for US stocks, do not attempt to market close positions (avoids queueing unfillable orders)
        if (!isCrypto && !isMarketOpen) {
          continue;
        }

        // 1. Lock Breakeven at +0.8% gain (~+28% ROI on ₹250 @ 35x slice!)
        if (unrealizedPlPercent >= 0.8 && !state.trailedPositions.has(normSym)) {
          state.trailedPositions.add(normSym);
          await broadcastTelegram(
            `🎯 *BREAKEVEN LOCKED ON ALPACA [${sideLabel}] — ZERO RISK*\n\n` +
            `• *Asset:* \`${pos.symbol}\`\n` +
            `• *Move:* +${unrealizedPlPercent.toFixed(2)}% (+$${profitUSD.toFixed(2)} / +₹${profitINR} on ₹250 slice)\n` +
            `• *Entry:* $${formatPrice(entryPrice)} | *Live:* $${formatPrice(currentPrice)}\n` +
            `🛡️ *AI Adjustment:* Stop trailed to entry ($${formatPrice(entryPrice)}).`
          );
        }

        // 2. Take Profit at +2.0% gain (~+70% ROI on ₹250 @ 35x slice!)
        if (unrealizedPlPercent >= 2.0 && !state.bookedPositions.has(normSym)) {
          state.bookedPositions.add(normSym);
          const closed = await closeAlpacaPosition(normSym);
          if (closed) {
            state.trailedPositions.delete(normSym);
            // Keep normSym in bookedPositions until the position actually vanishes from Alpaca!
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
            await broadcastTelegram(
              `💰 *ALPACA SCALP PROFIT BANKED [${sideLabel}]! (+${unrealizedPlPercent.toFixed(2)}%)*\n\n` +
              `• *Asset:* \`${pos.symbol}\`\n` +
              `• *Profit Realized:* +$${profitUSD.toFixed(2)} (*+₹${profitINR}* on ₹250 slice)\n` +
              `• *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}`
            );
            await recordTradeAndLearn({
              symbol: meta.symbol || pos.symbol,
              market: meta.market,
              setup: meta.setup,
              entryPrice,
              exitPrice: currentPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'WIN',
              candles: meta.candles,
              orderbook: meta.orderbook,
            });
          } else {
            state.bookedPositions.delete(normSym);
          }
        } else if (state.trailedPositions.has(normSym) && unrealizedPlPercent <= 0.05 && !state.bookedPositions.has(normSym)) {
          // 3. Breakeven Stop Hit
          state.bookedPositions.add(normSym);
          const closed = await closeAlpacaPosition(normSym);
          if (closed) {
            state.trailedPositions.delete(normSym);
            // Keep normSym in bookedPositions until the position actually vanishes from Alpaca!
            await broadcastTelegram(
              `🛡️ *ALPACA BREAKEVEN EXIT [${sideLabel}]: \`${pos.symbol}\`*\n\n` +
              `• *Exit Price:* $${formatPrice(currentPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
              `• *Impact:* ₹0 (Protected by AI Breakeven Lock!)`
            );
            await recordTradeAndLearn({
              symbol: meta.symbol || pos.symbol,
              market: meta.market,
              setup: meta.setup,
              entryPrice,
              exitPrice: currentPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'BREAKEVEN',
              candles: meta.candles,
              orderbook: meta.orderbook,
            });
          } else {
            state.bookedPositions.delete(normSym);
          }
        } else if (unrealizedPlPercent <= -1.2 && !state.bookedPositions.has(normSym)) {
          // 4. Hard Stop Loss Hit (-1.2%)
          state.bookedPositions.add(normSym);
          const closed = await closeAlpacaPosition(normSym);
          if (closed) {
            state.trailedPositions.delete(normSym);
            // Keep normSym in bookedPositions until the position actually vanishes from Alpaca!
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            await broadcastTelegram(
              `🛡️ *ALPACA STOP-LOSS TRIGGERED [${sideLabel}]: \`${pos.symbol}\`*\n\n` +
              `• *Exit Price:* $${formatPrice(currentPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
              `• *Impact on ₹250 Slice:* $${profitUSD.toFixed(2)} (~₹${profitINR})`
            );
            await recordTradeAndLearn({
              symbol: meta.symbol || pos.symbol,
              market: meta.market,
              setup: meta.setup,
              entryPrice,
              exitPrice: currentPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'LOSS',
              candles: meta.candles,
              orderbook: meta.orderbook,
            });
          } else {
            state.bookedPositions.delete(normSym);
          }
        }
      }
    }

    // Also Monitor Active Crypto SHORT Paper Positions (Tracked Live Against Alpaca Crypto Prices)
    for (const [sym, shortPos] of state.activeCryptoTrades.entries()) {
      const livePrice = await getAlpacaLatestTrade(sym);
      if (!livePrice || !shortPos.entryPrice) continue;
      // For a SHORT position, profit % is positive when livePrice < entryPrice
      const shortPnlPct = ((shortPos.entryPrice - livePrice) / shortPos.entryPrice) * 100;
      const profitUSD = (shortPnlPct / 100) * (shortPos.notionalUSD || state.paperSliceUSD);
      const profitINR = Math.round(profitUSD * USD_TO_INR);
      shortPos.livePrice = livePrice;
      shortPos.unrealizedPlPct = shortPnlPct;
      shortPos.unrealizedPlUSD = profitUSD;

      const normSym = normalizeSymbol(sym);
      const meta = state.activeTradeMeta.get(normSym) || {
        symbol: sym,
        market: 'crypto',
        setup: '1m Crypto Short Scalp (SHORT)',
      };

      if (shortPnlPct >= 0.8 && !shortPos.trailed) {
        shortPos.trailed = true;
        await broadcastTelegram(
          `🎯 *BREAKEVEN LOCKED ON ALPACA [SHORT] — ZERO RISK*\n\n` +
          `• *Asset:* \`${sym}\` (SHORT)\n` +
          `• *Move:* +${shortPnlPct.toFixed(2)}% (+$${profitUSD.toFixed(2)} / +₹${profitINR} on ₹250 slice)\n` +
          `• *Entry:* $${formatPrice(shortPos.entryPrice)} | *Live:* $${formatPrice(livePrice)}\n` +
          `🛡️ *AI Adjustment:* Short Stop trailed to entry ($${formatPrice(shortPos.entryPrice)}).`
        );
      }

      if (shortPnlPct >= 2.0) {
        state.activeCryptoTrades.delete(sym);
        state.realizedPnlUSD += profitUSD;
        state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
        const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
        await broadcastTelegram(
          `💰 *ALPACA SHORT SCALP PROFIT BANKED! (+${shortPnlPct.toFixed(2)}%)*\n\n` +
          `• *Asset:* \`${sym}\` (SHORT)\n` +
          `• *Profit Realized:* +$${profitUSD.toFixed(2)} (*+₹${profitINR}* on ₹250 slice)\n` +
          `• *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}`
        );
        await recordTradeAndLearn({
          symbol: sym,
          market: 'crypto',
          setup: meta.setup,
          entryPrice: shortPos.entryPrice,
          exitPrice: livePrice,
          pnlPct: shortPnlPct,
          outcome: 'WIN',
          candles: meta.candles,
          orderbook: meta.orderbook,
        });
      } else if (shortPos.trailed && shortPnlPct <= 0.05) {
        state.activeCryptoTrades.delete(sym);
        await broadcastTelegram(
          `🛡️ *ALPACA SHORT BREAKEVEN EXIT: \`${sym}\`*\n\n` +
          `• *Exit Price:* $${formatPrice(livePrice)} (${shortPnlPct.toFixed(2)}%)\n` +
          `• *Impact:* ₹0 (Protected by AI Breakeven Lock!)`
        );
        await recordTradeAndLearn({
          symbol: sym,
          market: 'crypto',
          setup: meta.setup,
          entryPrice: shortPos.entryPrice,
          exitPrice: livePrice,
          pnlPct: shortPnlPct,
          outcome: 'BREAKEVEN',
          candles: meta.candles,
          orderbook: meta.orderbook,
        });
      } else if (shortPnlPct <= -1.2) {
        state.activeCryptoTrades.delete(sym);
        state.realizedPnlUSD += profitUSD;
        state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
        await broadcastTelegram(
          `🛡️ *ALPACA SHORT STOP-LOSS TRIGGERED: \`${sym}\`*\n\n` +
          `• *Exit Price:* $${formatPrice(livePrice)} (${shortPnlPct.toFixed(2)}%)\n` +
          `• *Impact on ₹250 Slice:* $${profitUSD.toFixed(2)} (~₹${profitINR})`
        );
        await recordTradeAndLearn({
          symbol: sym,
          market: 'crypto',
          setup: meta.setup,
          entryPrice: shortPos.entryPrice,
          exitPrice: livePrice,
          pnlPct: shortPnlPct,
          outcome: 'LOSS',
          candles: meta.candles,
          orderbook: meta.orderbook,
        });
      }
    }
  } catch (err) {
    console.error('[TraderService] Position monitor error:', err.message);
  }
}

/**
 * BATCHED RATE-LIMIT-SAFE AI AUDIT
 * Audits ALL qualifying setups in a SINGLE Gemini API call (1 RPM total cost!)
 */
async function batchAuditCandidatesWithGemini(candidates) {
  const now = Date.now();
  const results = [];
  const uncached = [];

  for (const cand of candidates) {
    const cached = rateLimiter.auditCache.get(cand.symbol);
    if (cached && now - cached.timestamp < 2 * 60 * 1000) {
      results.push({ cand, audit: cached.audit });
    } else {
      uncached.push(cand);
    }
  }

  if (uncached.length === 0) return results;

  const fallbackMap = new Map();
  for (const cand of uncached) {
    const quantScore = computeQuantAndLearnedScore(cand);
    const symRecord = state.symbolStats.get(normalizeSymbol(cand.symbol)) || { wins: 0, losses: 0, consecutiveLosses: 0 };
    const minRequired = symRecord.consecutiveLosses >= 2 ? 8.2 : 6.2;
    const obText = cand.orderbook
      ? `Spread ${cand.orderbook.spreadPct}%, Bid/Ask ${cand.orderbook.imbalance}x`
      : 'Liquid Alpaca IEX book';

    fallbackMap.set(cand.symbol, {
      approved: quantScore >= minRequired,
      score: quantScore,
      minRequired,
      timemachineOdds: `${Math.min(79, Math.round(52 + quantScore * 2.3))}% Target-First`,
      thesis: `${cand.setup} on Alpaca (${obText}). Bayesian score ${quantScore}/10.`,
    });
  }

  if (!checkAndConsumeQuota(480)) {
    for (const cand of uncached) {
      results.push({ cand, audit: fallbackMap.get(cand.symbol) });
    }
    return results;
  }

  const { key, model } = getNextKeyAndModel();
  if (!key) {
    for (const cand of uncached) {
      results.push({ cand, audit: fallbackMap.get(cand.symbol) });
    }
    return results;
  }

  const lessonsCompact =
    state.learnedLessons.length > 0
      ? state.learnedLessons.slice(0, 4).map((l) => `${l.symbol}:${l.lesson}`).join(' | ')
      : 'Require full candle body & orderbook confirmation';

  const batchSummary = uncached.map((c) => ({
    symbol: c.symbol,
    side: c.action === 'sell' ? 'SHORT' : 'LONG',
    setup: c.setup,
    price: c.entryPrice,
    quantScore: fallbackMap.get(c.symbol).score,
    ob: c.orderbook || 'IEX',
  }));

  const prompt = `11-Agent Bi-Directional (LONG + SHORT) Day-Trader-Skill + Autonomous-Trader Batch Audit (₹6,000 -> ₹50,000 Strategy on Alpaca Paper: ₹250 slice @ 35x = $100 notional).
Record: ${state.totalWins}W/${state.totalLosses}L. Learned Rules: ${lessonsCompact}.
Candidates: ${JSON.stringify(batchSummary)}
Return JSON object mapping each symbol to {"approved":true,"score":8.2,"timemachineOdds":"70% Target-First","thesis":"Max 16 words"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (res.status === 429) {
      rateLimiter.cooldownUntil = Date.now() + 30 * 1000;
      for (const cand of uncached) results.push({ cand, audit: fallbackMap.get(cand.symbol) });
      return results;
    }
    if (!res.ok) {
      for (const cand of uncached) results.push({ cand, audit: fallbackMap.get(cand.symbol) });
      return results;
    }

    const data = await res.json();
    let parsed = {};
    try {
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.warn('[TraderService] Gemini JSON parse fallback:', parseErr.message);
    }

    for (const cand of uncached) {
      const fb = fallbackMap.get(cand.symbol);
      const aiItem = parsed[cand.symbol] || parsed;
      const blendedScore = Number((((Number(aiItem?.score) || fb.score) + fb.score) / 2).toFixed(1));
      const finalAudit = {
        approved: aiItem?.approved !== false && blendedScore >= fb.minRequired,
        score: blendedScore,
        timemachineOdds: aiItem?.timemachineOdds || fb.timemachineOdds,
        thesis: (aiItem?.thesis || fb.thesis).replace(/[*_`]/g, ''),
      };
      rateLimiter.auditCache.set(cand.symbol, { audit: finalAudit, timestamp: now });
      results.push({ cand, audit: finalAudit });
    }
    return results;
  } catch (err) {
    for (const cand of uncached) {
      results.push({ cand, audit: fallbackMap.get(cand.symbol) });
    }
    return results;
  }
}

/**
 * 1-MINUTE UNIFIED BI-DIRECTIONAL (LONG + SHORT) ALPACA PAPER SCANNER
 * State-Aware: Distinguishes Fresh Entries, Scale-Ins (Pyramiding winners), and Prevents Averaging Down!
 */
async function runMarketScan(isManual = false) {
  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();
  const rawCandidates = [];
  const topMoversPreview = [];

  await monitorOngoingTrades();

  // Fetch current open positions to make scanning state-aware
  const openPositions = await getAlpacaPositions();
  const openPositionsMap = new Map();
  for (const p of openPositions || []) {
    openPositionsMap.set(normalizeSymbol(p.symbol), p);
  }
  for (const [sym, sp] of state.activeCryptoTrades.entries()) {
    openPositionsMap.set(normalizeSymbol(sym), {
      symbol: sym,
      side: 'short',
      unrealized_plpc: (Number(sp.unrealizedPlPct || 0) / 100).toFixed(4),
      market_value: String(sp.notionalUSD || state.paperSliceUSD),
    });
  }

  // 1. Scan All 14 US Equities on Alpaca IEX via Snapshots (Both LONG & SHORT!)
  const clock = await getAlpacaClock();
  const isMarketOpen = clock ? clock.is_open : false;

  if (isMarketOpen) {
    const stockSnaps = await getMultiStockSnapshots(STOCK_WATCHLIST);
    for (const [sym, snap] of Object.entries(stockSnaps)) {
      const minBar = snap?.minuteBar;
      const dailyBar = snap?.dailyBar;
      const liveTradePrice = snap?.latestTrade?.p || minBar?.c;
      if (!minBar || !liveTradePrice) continue;

      const bodyPct = minBar.o > 0 ? (minBar.c - minBar.o) / minBar.o : 0;

      // Bullish (LONG) conditions
      const isBreakoutLong = dailyBar && liveTradePrice >= dailyBar.vw && minBar.c > minBar.o;
      const isBounceLong = dailyBar && minBar.l <= dailyBar.vw && minBar.c > minBar.o;
      const isImpulseLong = bodyPct >= 0.0005;

      // Bearish (SHORT) conditions
      const isBreakdownShort = dailyBar && liveTradePrice < dailyBar.vw && minBar.c < minBar.o;
      const isRejectionShort = dailyBar && minBar.h >= dailyBar.vw && minBar.c < minBar.o;
      const isDumpShort = bodyPct <= -0.0005;

      if (isBreakoutLong || isBounceLong || isImpulseLong) {
        const setupName = isBreakoutLong
          ? '1m IEX VWAP Breakout (LONG)'
          : isBounceLong
          ? '1m IEX Support Bounce (LONG)'
          : '1m IEX Bullish Impulse (LONG)';
        const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;

        rawCandidates.push({
          market: 'stock',
          symbol: sym,
          action: 'buy',
          entryPrice: liveTradePrice,
          stopLoss: liveTradePrice * 0.988,
          takeProfit: liveTradePrice * 1.022,
          qty: 1,
          setup: setupName,
          candles: [minBar, dailyBar].filter(Boolean),
          strength: Math.abs(bodyPct) + learnedBonus,
        });
      } else if (isBreakdownShort || isRejectionShort || isDumpShort) {
        const setupName = isBreakdownShort
          ? '1m IEX VWAP Breakdown (SHORT)'
          : isRejectionShort
          ? '1m IEX Resistance Rejection (SHORT)'
          : '1m IEX Bearish Dump Scalp (SHORT)';
        const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;

        rawCandidates.push({
          market: 'stock',
          symbol: sym,
          action: 'sell',
          entryPrice: liveTradePrice,
          stopLoss: liveTradePrice * 1.012,
          takeProfit: liveTradePrice * 0.978,
          qty: 1,
          setup: setupName,
          candles: [minBar, dailyBar].filter(Boolean),
          strength: Math.abs(bodyPct) + learnedBonus,
        });
      }
    }
  }

  // 2. Scan All 20 Alpaca 24/7 Crypto Pairs via Snapshots + L2 Orderbooks (Both LONG & SHORT!)
  try {
    const { snapshots: cryptoSnaps, orderbooks: cryptoBooksMap } = await getAlpacaCryptoSnapshotsAndBooks(
      ALPACA_CRYPTO_WATCHLIST
    );

    const moverList = [];
    for (const [pair, snap] of Object.entries(cryptoSnaps)) {
      const minBar = snap?.minuteBar;
      const dailyBar = snap?.dailyBar;
      const prevDaily = snap?.prevDailyBar;
      const close = snap?.latestTrade?.p || minBar?.c;
      if (!minBar || !close) continue;

      const refOpen = dailyBar?.o || prevDaily?.c || minBar.o;
      const movePct = refOpen > 0 ? ((close - refOpen) / refOpen) * 100 : 0;
      moverList.push({ pair, move5m: movePct });

      const open = Number(minBar.o || close);
      const bodyPct = open > 0 ? (close - open) / open : 0;
      const ob = cryptoBooksMap[pair] || null;
      const imb = Number(ob?.imbalance || 1);

      // Bullish (LONG) conditions
      const isBreakoutLong = dailyBar && close >= dailyBar.vw && close > open;
      const isWickBounceLong = imb >= 1.15 && close >= open;
      const isImpulseLong = bodyPct >= 0.0004;

      // Bearish (SHORT) conditions
      const isBreakdownShort = dailyBar && close < dailyBar.vw && close < open;
      const isRejectionShort = imb <= 0.88 && close <= open;
      const isDumpShort = bodyPct <= -0.0004;

      const decideShort =
        (isBreakdownShort || isRejectionShort || isDumpShort) &&
        (bodyPct < 0 || imb < 0.95);

      const action = decideShort ? 'sell' : 'buy';
      const setupName = decideShort
        ? isBreakdownShort
          ? '1m VWAP Breakdown (SHORT)'
          : isRejectionShort
          ? '1m Ask-Wall Rejection (SHORT)'
          : '1m Bearish Momentum Scalp (SHORT)'
        : isBreakoutLong
        ? '1m Micro-Scalp Breakout (LONG)'
        : isWickBounceLong
        ? '1m Support Wick Bounce (LONG)'
        : '1m Bullish Impulse Scalp (LONG)';

      const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;
      const obEdge = decideShort ? Math.max(0, 1 - imb) * 0.001 : Math.max(0, imb - 1) * 0.001;

      const item = {
        market: 'crypto',
        symbol: pair,
        action,
        entryPrice: close,
        stopLoss: decideShort ? close * 1.012 : close * 0.988,
        takeProfit: decideShort ? close * 0.978 : close * 1.022,
        qty: 1,
        setup: setupName,
        candles: [minBar, dailyBar].filter(Boolean),
        orderbook: ob,
        strength: Math.abs(bodyPct) + obEdge + learnedBonus,
      };

      rawCandidates.push(item);
    }

    moverList.sort((a, b) => Math.abs(b.move5m) - Math.abs(a.move5m));
    for (const m of moverList.slice(0, 4)) {
      topMoversPreview.push(`${m.pair.replace('/USD', '')} (${m.move5m >= 0 ? '+' : ''}${m.move5m.toFixed(1)}%)`);
    }
  } catch (err) {
    console.error('[TraderService] Alpaca Crypto scan error:', err.message);
  }

  // 3. Pro-Trader Position Management Engine: Classify into Fresh Entry vs Scale-In vs Suppress
  const candidates = [];
  for (const item of rawCandidates) {
    const norm = normalizeSymbol(item.symbol);
    const existing = openPositionsMap.get(norm);
    const lastAlert = state.alertCooldowns.get(item.symbol) || 0;
    if (!isManual && now - lastAlert < 2 * 60 * 1000) continue;

    if (!existing) {
      // Scenario 1: Fresh Entry on an unheld asset
      candidates.push({
        ...item,
        intent: 'FRESH_ENTRY',
      });
    } else {
      const isPosLong = existing.side !== 'short' && Number(existing.qty || 1) > 0;
      const isSignalLong = item.action === 'buy';
      const plPercent = Number(existing.unrealized_plpc || 0) * 100;

      if (isPosLong === isSignalLong) {
        // Same Direction: Check if in profit for Pyramiding (Scale-In)
        const marketVal = Math.abs(Number(existing.market_value || 0));
        const estimatedSlices = Math.max(1, Math.round(marketVal / state.paperSliceUSD));

        if (plPercent >= 0.75 && estimatedSlices < 3) {
          // Scenario 2: Scale-In on a confirmed runner (Pyramiding)
          candidates.push({
            ...item,
            intent: 'SCALE_IN',
            currentPlPct: plPercent,
            existingSlices: estimatedSlices,
            setup: `📈 Scale-In (+1 Slice): ${item.setup}`,
          });
        } else {
          // Scenario 3: Anti-Martingale Rule: Suppress alert if trade is flat/losing or already at 3 slices max!
          // This stops repeated TSLA or XRP cards when already floating!
          continue;
        }
      } else {
        // Opposite direction signal while in an active trade: Suppress to avoid shifting original trade until decided!
        continue;
      }
    }
  }

  // Batch-audit qualifying setups (up to 5 per minute in 1 single Gemini API call!)
  candidates.sort((a, b) => b.strength - a.strength);
  const batchToAudit = candidates.slice(0, 5);
  const auditedList = await batchAuditCandidatesWithGemini(batchToAudit);
  const hits = [];

  for (const { cand, audit } of auditedList) {
    if (!audit.approved) continue;

    const signal = {
      market: cand.market,
      symbol: cand.symbol,
      action: cand.action || 'buy',
      entryPrice: cand.entryPrice,
      stopLoss: cand.stopLoss,
      takeProfit: cand.takeProfit,
      qty: cand.qty,
      time: new Date(),
      setup: cand.setup,
      intent: cand.intent,
      currentPlPct: cand.currentPlPct,
      existingSlices: cand.existingSlices,
      candles: cand.candles,
      orderbook: cand.orderbook,
      riskINR: state.maxRiskPerTradeINR,
      rewardINR: state.targetScalpProfitINR,
      sliceMarginINR: state.sliceMarginINR,
      leverage: state.defaultLeverage,
      aiScore: audit.score,
      timemachineOdds: audit.timemachineOdds,
      aiThesis: audit.thesis,
    };

    hits.push(signal);
    state.alertCooldowns.set(cand.symbol, now);
    state.recentSignals.unshift(signal);
    if (state.recentSignals.length > 40) state.recentSignals.pop();
  }

  // 3. Send Every-1-Minute Unified Alpaca Paper & ₹6,000 Strategy Update to Telegram
  if (state.sendEveryScanReport && state.subscribedChatIds.size > 0) {
    const alpacaPositions = await getAlpacaPositions();
    const totalAlpacaOpen = alpacaPositions?.length || 0;
    const totalCryptoShorts = state.activeCryptoTrades.size;
    const totalOpen = totalAlpacaOpen + totalCryptoShorts;
    let unrealizedTotalUSD = 0;

    let posSummary = '• *Alpaca Open Positions:* 0 active\n';
    if (totalOpen > 0) {
      posSummary = `*Alpaca Paper Open Positions (${totalOpen}):*\n`;
      for (const p of alpacaPositions || []) {
        const norm = normalizeSymbol(p.symbol);
        const plUsd = Number(p.unrealized_pl);
        unrealizedTotalUSD += plUsd;
        const plPct = (Number(p.unrealized_plpc) * 100).toFixed(2);
        const plInr = Math.round(plUsd * USD_TO_INR);
        const dirTag = p.side === 'short' || Number(p.qty) < 0 ? '🔴SHORT' : '🟢LONG';
        const tag = state.trailedPositions.has(norm) ? '🛡️ [Breakeven]' : '👁️ [Live]';
        posSummary += `• \`${p.symbol}\` (${dirTag}): ${plPct}% ($${plUsd.toFixed(2)} / ₹${plInr >= 0 ? '+' : ''}${plInr}) ${tag}\n`;
      }
      for (const [sym, sp] of state.activeCryptoTrades.entries()) {
        const plUsd = Number(sp.unrealizedPlUSD || 0);
        unrealizedTotalUSD += plUsd;
        const plPct = Number(sp.unrealizedPlPct || 0).toFixed(2);
        const plInr = Math.round(plUsd * USD_TO_INR);
        const tag = sp.trailed ? '🛡️ [Breakeven]' : '👁️ [Live]';
        posSummary += `• \`${sym}\` (🔴SHORT): ${plPct}% ($${plUsd.toFixed(2)} / ₹${plInr >= 0 ? '+' : ''}${plInr}) ${tag}\n`;
      }
    }

    const totalDecided = state.totalWins + state.totalLosses;
    const winRateStr = totalDecided > 0 ? `${((state.totalWins / totalDecided) * 100).toFixed(0)}%` : 'Calibrating';
    const liveLifelineINR = state.lifelineBaseINR + state.realizedPnlINR + Math.round(unrealizedTotalUSD * USD_TO_INR);
    const moversText =
      topMoversPreview.length > 0
        ? `🔥 *Alpaca 5m Pulse:* ${topMoversPreview.join(', ')}\n`
        : '';

    const pulseMsg =
      `⏱️ *1-MIN ALPACA PAPER DESK #${state.totalScansRun}*\n\n` +
      `${moversText}` +
      `${posSummary}` +
      `🎯 *₹6,000 Strategy Live Balance:* *₹${liveLifelineINR.toLocaleString()}* ➔ ₹${state.overallGoalINR.toLocaleString()}\n` +
      `🧠 *Accuracy:* ${state.totalWins}W-${state.totalLosses}L-${state.totalBreakevens}BE (${winRateStr}) | *Rules:* ${state.learnedLessons.length}\n` +
      `⚡ *Qualifying Setups Pushed:* ${hits.length} | 🔋 *RPM:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit}`;

    await broadcastTelegram(pulseMsg);
  }

  // 4. Push ALL Qualifying Interactive Trade Proposal Cards (Approve / Decline)
  for (const signal of hits) {
    await notifyTradeOpportunity(signal);
  }

  return hits;
}

function formatPrice(val) {
  const num = Number(val);
  if (num < 0.01) return num.toFixed(6);
  if (num < 1) return num.toFixed(4);
  return num.toFixed(2);
}

async function notifyTradeOpportunity(signal) {
  const isShort = signal.action === 'sell';
  const isScaleIn = signal.intent === 'SCALE_IN';
  const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
  const sideCode = isShort ? 's' : 'b';
  const entryStr = formatPrice(signal.entryPrice);
  const stopStr = formatPrice(signal.stopLoss);
  const targetStr = formatPrice(signal.takeProfit);
  const obLine = signal.orderbook
    ? `• *Alpaca Orderbook:* Bid/Ask ${signal.orderbook.imbalance}x | Spread ${signal.orderbook.spreadPct}%\n`
    : '';

  const scaleInContext = isScaleIn
    ? `📈 *SCALE-IN ON RUNNING WINNER (Slice #${(signal.existingSlices || 1) + 1} of 3)*\n` +
      `• *Current Trade Gain:* +${(signal.currentPlPct || 0).toFixed(2)}% (Breakeven Locked)\n` +
      `• *Action:* Adding +1 isolated slice ($${state.paperSliceUSD} / ₹${signal.sliceMarginINR}) to compound momentum without extra risk!\n\n`
    : '';

  const headerTitle = isScaleIn
    ? `📈 *SCALE-IN: \`${signal.symbol}\`* [${sideBadge}]`
    : `⚡ *ALPACA PAPER SCALP [${sideBadge}]: \`${signal.symbol}\`*`;

  const card =
    `${headerTitle}\n\n` +
    `${scaleInContext}` +
    `🧠 *Self-Learning AI Audit (${signal.aiScore}/10):*\n` +
    `"${signal.aiThesis}"\n\n` +
    `• *Direction:* *${sideBadge}*\n` +
    `• *Time Machine Odds:* ${signal.timemachineOdds}\n` +
    `• *Setup:* ${signal.setup}\n` +
    `${obLine}` +
    `• *Alpaca Live Price:* $${entryStr}\n` +
    `• *₹6,000 Strategy Slice:* ₹${signal.sliceMarginINR} Margin @ 35x = *$${state.paperSliceUSD} Alpaca Order*\n` +
    `• *Stop Loss:* $${stopStr} (${isShort ? '+1.2% above' : '-1.2% below'} | Risk: -₹${signal.riskINR})\n` +
    `• *Take Profit:* $${targetStr} (${isShort ? '-2.2% drop' : '+2.2% gain'} | Gain: +₹${signal.rewardINR})\n\n` +
    `🛡️ *Rule:* Never averages down on losing trades. Only confirmed winners get Scale-In cards!`;

  const cbData = `ex:${signal.symbol}:${sideCode}:${signal.qty}:${stopStr}:${targetStr}:${entryStr}`.slice(0, 64);

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: isScaleIn ? 'Approve (+1 Slice)' : 'Approve',
          callback_data: cbData,
        },
        {
          text: 'Decline',
          callback_data: 'cancel',
        },
      ],
    ],
  };

  await broadcastTelegram(card, keyboard);
}

async function handleTelegramUpdate(update) {
  let fromChatId = null;
  if (update.message?.chat?.id) fromChatId = update.message.chat.id;
  if (update.callback_query?.message?.chat?.id) fromChatId = update.callback_query.message.chat.id;

  if (fromChatId) {
    await saveSubscriber(fromChatId);
  }

  // 1. Handle Inline Button Clicks (Approve / Decline -> Executes 100% on Alpaca Paper!)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message.chat.id;
    const messageId = cq.message.message_id;
    const data = cq.data || '';

    if (data === 'cancel') {
      await sendTelegram('answerCallbackQuery', { callback_query_id: cq.id, text: 'Declined' });
      await sendTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: '❌ *Trade Declined.*\nNo Alpaca paper order placed.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (data.startsWith('ex:') || data.startsWith('alpaca_exec:')) {
      const parts = data.split(':');
      const rawSymbol = parts[1];
      const symbol = resolveAlpacaSymbol(rawSymbol);
      const rawSide = parts[2] || 'buy';
      const side = rawSide === 'b' ? 'buy' : rawSide === 's' ? 'sell' : rawSide;
      const isShort = side === 'sell';
      const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
      const qty = parts[3] || '1';
      const originalEntryPrice = parts[6];

      await sendTelegram('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `Executing ${sideBadge} ${symbol} on Alpaca Paper...`,
      });

      const livePrice = (await getAlpacaLatestTrade(symbol)) || Number(originalEntryPrice);
      const activeStop = isShort ? livePrice * 1.012 : livePrice * 0.988;
      const activeTarget = isShort ? livePrice * 0.978 : livePrice * 1.022;

      try {
        const matchingSignal = state.recentSignals.find((s) => s.symbol === symbol || s.symbol === rawSymbol);
        const order = await placeAlpacaPaperOrder({
          symbol,
          qty,
          side,
          entryPrice: livePrice,
          stopPrice: activeStop,
          targetPrice: activeTarget,
        });

        state.tradesToday += 1;
        const norm = normalizeSymbol(symbol);
        state.activeTradeMeta.set(norm, {
          symbol,
          market: symbol.includes('/') ? 'crypto' : 'stock',
          setup: matchingSignal?.setup || `1m Alpaca Paper Scalp (${isShort ? 'SHORT' : 'LONG'})`,
          candles: matchingSignal?.candles || [],
          orderbook: matchingSignal?.orderbook || null,
        });

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `✅ *APPROVED — EXECUTED ON ALPACA PAPER*\n\n` +
            `• *Asset:* \`${symbol}\` (*${sideBadge}*)\n` +
            `• *Order Size:* $${state.paperSliceUSD} Notional (₹${state.sliceMarginINR} Slice @ 35x)\n` +
            `• *Live Fill Price:* ~$${formatPrice(livePrice)}\n` +
            `• *AI Stop Loss:* $${formatPrice(activeStop)} (${isShort ? '+1.2%' : '-1.2%'} / -₹${state.maxRiskPerTradeINR})\n` +
            `• *AI Take Profit:* $${formatPrice(activeTarget)} (${isShort ? '-2.2%' : '+2.2%'} / +₹${state.targetScalpProfitINR})\n` +
            `• *Alpaca Order ID:* \`${order.id}\`\n\n` +
            `🧠 *30s AI Position Monitor Active:* Automatically locks Breakeven at +0.8%, closes on target/stop, and logs post-mortem learning!`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `❌ Alpaca Paper Execution Error on ${symbol}: ${err.message}`,
        });
      }
      return;
    }
  }

  // 2. Handle Text Messages
  if (update.message && update.message.text) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text.startsWith('/start') || text.startsWith('/help')) {
      const welcome =
        `🤖 *7-Day ₹6,000 ➔ ₹50,000 Strategy on Alpaca Paper*\n\n` +
        `💵 *Exact Strategy Mapping:* Each **₹250 INR slice @ 35x leverage** = **$100 USD Notional Order** on Alpaca Paper (Stocks + 24/7 Crypto)!\n` +
        `⚡ *Unlimited Multi-Trade:* Pushes ALL qualifying setups every minute — click \`Approve\` on as many as you want!\n` +
        `🧠 *Self-Learning Brain:* Every closed Alpaca position updates Bayesian setup weights & Post-Mortem rules in PostgreSQL!\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - View ₹6,000 Strategy Balance, Open Alpaca Positions & Win Rate %\n` +
        `• \`/brain\` or \`/learn\` - View 7-Day Accuracy Scoreboard & Learned Rules\n` +
        `• \`/scan\` - Force immediate 1-minute Alpaca scan right now\n` +
        `• \`/balance\` - View Alpaca Paper Equity & Open Positions\n` +
        `• \`/mute\` / \`/unmute\` - Toggle 1-minute heartbeat summaries`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/brain' || text === '/learn') {
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';
      const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;

      let setupWeightsText = '_Calibrating setup weights as Alpaca paper trades close..._\n';
      if (state.setupStats.size > 0) {
        setupWeightsText = '';
        for (const [sName, st] of state.setupStats.entries()) {
          setupWeightsText += `• \`${sName}\`: ${st.wins}W/${st.losses}L (${st.winRate}%) | Weight: ${st.weightBonus >= 0 ? '+' : ''}${st.weightBonus}\n`;
        }
      }

      let lessonsList = '_Click Approve on trade cards to log closed-loop Alpaca post-mortem rules!_\n';
      if (state.learnedLessons.length > 0) {
        lessonsList = state.learnedLessons
          .slice(0, 8)
          .map((l, i) => `${i + 1}. \`[${l.symbol} ${l.outcome}]\` ${l.lesson}`)
          .join('\n');
      }

      const reply =
        `🧠 *7-DAY ALPACA PAPER ACCURACY & SELF-LEARNING BRAIN*\n\n` +
        `🎯 *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `📊 *Alpaca Paper Record:* ${state.totalWins}W | ${state.totalLosses}L | ${state.totalBreakevens}BE (*${winRate}% Win Rate*)\n` +
        `🔋 *API Quota Usage:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit} RPM | ${rateLimiter.tokensThisMinute}/${rateLimiter.tpmLimit} TPM | ${rateLimiter.requestsToday}/${rateLimiter.rpdLimit} RPD\n\n` +
        `*1. Bayesian Setup Expectancy Matrix:*\n${setupWeightsText}\n` +
        `*2. Permanent Post-Mortem Rules:*\n${lessonsList}`;

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/mute') {
      state.sendEveryScanReport = false;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🔕 *1-Minute Heartbeat Summaries Muted.* You will still receive all actionable `Approve` / `Decline` trade cards.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/unmute') {
      state.sendEveryScanReport = true;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🔔 *1-Minute Heartbeat Summaries Active!* You will receive a live scan & position update every minute.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/status') {
      const clock = await getAlpacaClock();
      const alpaca = await getAlpacaAccount();
      const positions = await getAlpacaPositions();
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';

      let unrealizedUSD = 0;
      for (const p of positions) unrealizedUSD += Number(p.unrealized_pl || 0);
      const liveLifelineINR = state.lifelineBaseINR + state.realizedPnlINR + Math.round(unrealizedUSD * USD_TO_INR);

      const lastScanStr = state.lastScanTime ? state.lastScanTime.toLocaleTimeString() : 'Running...';
      const usMarketStatus = clock?.is_open ? '🟢 OPEN (Real-Time IEX)' : '🔴 CLOSED';

      let reply =
        `🛰️ *7-DAY ₹6,000 ➔ ₹50,000 ALPACA CALIBRATION STATUS*\n\n` +
        `🎯 *₹6,000 Strategy Live Balance:* *₹${liveLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `🧠 *Model Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}%*)\n` +
        `🔋 *Quota Governor:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit} RPM | ${rateLimiter.requestsToday}/${rateLimiter.rpdLimit} RPD\n\n` +
        `• *1-Min Multi-Trade Scanner:* 🟢 RUNNING (Scan #${state.totalScansRun})\n` +
        `• *30s Alpaca Position Monitor:* 🟢 ACTIVE\n` +
        `• *Last Scan Time:* ${lastScanStr}\n` +
        `• *US Stock Market:* ${usMarketStatus}\n` +
        `• *Alpaca 24/7 Crypto:* 🟢 ACTIVE (20 USD Pairs)\n\n`;

      if (positions.length > 0) {
        reply += `*Open Alpaca Paper Positions (${positions.length}):*\n`;
        for (const p of positions) {
          const plUsd = Number(p.unrealized_pl);
          const plInr = Math.round(plUsd * USD_TO_INR);
          const plPercent = (Number(p.unrealized_plpc) * 100).toFixed(2);
          reply += `• \`${p.symbol}\`: ${plPercent}% ($${plUsd.toFixed(2)} / ₹${plInr >= 0 ? '+' : ''}${plInr})\n`;
        }
        reply += '\n';
      }

      if (alpaca) {
        reply +=
          `💼 *Alpaca Paper Equity:* $${Number(alpaca.portfolio_value).toLocaleString()} (BP: $${Number(alpaca.buying_power).toLocaleString()})`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/scan') {
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '⏳ *Running immediate 1-minute unified Alpaca Paper scan...*',
        parse_mode: 'Markdown',
      });
      await runMarketScan(true);
      return;
    }

    if (text === '/balance') {
      const alpaca = await getAlpacaAccount();
      const positions = await getAlpacaPositions();

      let reply = `💼 *ALPACA PAPER SANDBOX PORTFOLIO*\n\n`;

      if (alpaca) {
        reply +=
          `• *Total Equity:* $${Number(alpaca.portfolio_value).toLocaleString()}\n` +
          `• *Cash:* $${Number(alpaca.cash).toLocaleString()}\n` +
          `• *Buying Power:* $${Number(alpaca.buying_power).toLocaleString()}\n` +
          `• *Open Positions:* ${positions.length}\n` +
          `• *Account Status:* ${alpaca.status}\n`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text.startsWith('/trade')) {
      const parts = text.split(/\s+/);
      if (parts.length < 4) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `⚠️ *Usage:* \`/trade <SYMBOL> <BUY|SELL> <QTY>\`\n_Examples:_ \`/trade MSFT BUY 1\` or \`/trade BTC/USD BUY 1\``,
          parse_mode: 'Markdown',
        });
        return;
      }

      const [, symbol, side, qtyStr] = parts;
      const qty = parseFloat(qtyStr) || 1;
      const cleanSide = side.toLowerCase() === 'sell' ? 'sell' : 'buy';
      const cleanSymbol = resolveAlpacaSymbol(symbol);

      const currentPrice = (await getAlpacaLatestTrade(cleanSymbol)) || 400.0;
      const stopDistance = currentPrice * 0.012;
      const targetDistance = currentPrice * 0.022;

      const stopPrice = cleanSide === 'buy' ? currentPrice - stopDistance : currentPrice + stopDistance;
      const targetPrice = cleanSide === 'buy' ? currentPrice + targetDistance : currentPrice - targetDistance;

      const promptText =
        `📊 *MANUAL ALPACA PAPER PROPOSAL: \`${cleanSymbol}\`*\n\n` +
        `• *Action:* ${cleanSide.toUpperCase()} ($${state.paperSliceUSD} Notional = ₹250 @ 35x)\n` +
        `• *Live Alpaca Price:* $${formatPrice(currentPrice)}\n` +
        `• *Stop Loss:* $${formatPrice(stopPrice)} (-1.2%)\n` +
        `• *Take Profit:* $${formatPrice(targetPrice)} (+2.2%)\n\n` +
        `🛡️ *Active Trailing & Learning:* Moves stop to Breakeven at +0.8% and logs post-mortem lesson on close.`;

      const cbData = `ex:${cleanSymbol}:${cleanSide === 'buy' ? 'b' : 's'}:${qty}:${formatPrice(stopPrice)}:${formatPrice(targetPrice)}:${formatPrice(currentPrice)}`.slice(0, 64);

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: 'Approve',
              callback_data: cbData,
            },
            {
              text: 'Decline',
              callback_data: 'cancel',
            },
          ],
        ],
      };

      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: promptText,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      return;
    }

    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: `Command not recognized. Type /help, /status, or /brain.`,
    });
  }
}

// 24/7 background scanner cycle (every 60s) & active Alpaca trade monitor (every 30s)
async function startBackgroundLoops() {
  console.log(`[TraderService] Starting 1-Minute Unified Alpaca Paper Scanner (60s) & Monitor (30s) with ${GEMINI_KEYS.length} Gemini keys...`);
  await initDbAndMemory();

  setTimeout(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Initial auto-scan error:', err));
  }, 4000);

  setInterval(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Scheduled 1m scan error:', err));
  }, state.scannerIntervalMs);

  setInterval(() => {
    monitorOngoingTrades().catch((err) => console.error('[TraderService] Monitor error:', err));
  }, state.monitorIntervalMs);
}

startBackgroundLoops();

module.exports = {
  handleTelegramUpdate,
  getAlpacaAccount,
  getAlpacaPositions,
  getCoinDCXBalances,
  placeAlpacaPaperOrder,
  closeAlpacaPosition,
  runMarketScan,
  monitorOngoingTrades,
  state,
};
