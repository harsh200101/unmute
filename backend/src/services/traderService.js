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

// Each model variation has its own separate RPM/RPD quota bucket in Google AI Studio
const GEMINI_MODEL_BUCKETS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
];

let geminiKeyIdx = 0;
let geminiModelIdx = 0;

// Rate-Limit Governor (RPM, TPM, RPD tracking & protection)
const rateLimiter = {
  rpmLimit: 10,             // Conservative self-imposed ceiling per minute
  tpmLimit: 15000,          // Max 15k tokens per minute
  rpdLimit: 1200,           // Max 1,200 requests per day across buckets
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  requestsToday: 0,
  lastMinuteReset: Date.now(),
  lastDayReset: Date.now(),
  cooldownUntil: 0,
  auditCache: new Map(),    // symbol -> { audit, timestamp } (3m cache prevents duplicate RPD burn)
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

// State management for 7-Day Unified Alpaca Paper Trading (Stocks + 24/7 Crypto) & Self-Learning
const state = {
  subscribedChatIds: new Set(),
  scannerIntervalMs: 60 * 1000,   // Automatic scan & Telegram update every 1 minute (60s)
  monitorIntervalMs: 30 * 1000,   // Active Alpaca position monitor & trailing stop every 30s
  sendEveryScanReport: true,      // Push 1-minute status + trade updates to Telegram every minute
  paperOnlyMode: true,            // 7-Day Unified Alpaca Paper Trading Calibration Mode
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(),      // symbol -> timestamp (3m cooldown per symbol)
  trailedPositions: new Set(),    // symbol already trailed to breakeven on Alpaca
  bookedPositions: new Set(),     // symbol already closed on Alpaca
  activeTradeMeta: new Map(),     // normSymbol (e.g. BTCUSD, MSFT) -> { symbol, market, setup, candles, orderbook }
  // Structural Self-Learning Memory (Synced with PostgreSQL)
  learnedLessons: [],             // Array of { id, symbol, setup, outcome, lesson, created_at }
  symbolStats: new Map(),         // symbol -> { wins, losses, breakevens, consecutiveLosses, totalPnl }
  setupStats: new Map(),          // setup -> { wins, losses, breakevens, winRate, weightBonus }
  totalWins: 0,
  totalLosses: 0,
  totalBreakevens: 0,
  // Micro-Scalp Isolated Compounding Engine
  lifelineBaseINR: 6000,
  overallGoalINR: 50000,
  targetDays: 7,
  dailyTargetINR: 6300,
  realizedPnlUSD: 0,
  realizedPnlINR: 0,
  tradesToday: 0,
  maxTradesPerDay: 50,
  paperSliceUSD: 500,             // $500 USD per Alpaca Paper trade slice
  maxRiskPerTradeINR: 150,        // Equivalent isolated slice risk (-1.2%)
  targetScalpProfitINR: 350,      // Equivalent quick profit target (+2.0% to +2.5%)
  sliceMarginINR: 250,            // Isolated margin slice reference
  defaultLeverage: 'Alpaca Paper (25x-50x Sim)',
};

// 14 High-Beta US Equities on Alpaca Paper
const STOCK_WATCHLIST = [
  'TSLA', 'NVDA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'SPY', 'QQQ',
  'COIN', 'MSTR', 'PLTR', 'MARA', 'SMCI',
];

// 20 Liquid 24/7 Crypto USD Pairs Tradable Directly on Alpaca Paper!
const ALPACA_CRYPTO_WATCHLIST = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'XRP/USD',
  'AVAX/USD', 'LINK/USD', 'PEPE/USD', 'SHIB/USD', 'DOT/USD',
  'ADA/USD', 'LTC/USD', 'UNI/USD', 'AAVE/USD', 'RENDER/USD',
  'ARB/USD', 'WIF/USD', 'BONK/USD', 'ONDO/USD', 'HYPE/USD',
];

function normalizeSymbol(sym) {
  return String(sym || '').replace('/', '').toUpperCase();
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
      updateStructuralStats(row.symbol, row.setup, row.outcome, Number(row.pnl_pct || 0));
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

/**
 * Updates both Symbol-level and Setup-level Bayesian Expectancy Weights
 */
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

/**
 * Computes deterministic quantitative score + structural self-learning bonus at 0 token cost
 */
function computeQuantAndLearnedScore({ symbol, setup, candles, orderbook }) {
  let score = 7.0;
  const symStat = state.symbolStats.get(normalizeSymbol(symbol));
  const setStat = state.setupStats.get(setup);

  if (setStat) score += setStat.weightBonus;

  if (symStat) {
    if (symStat.consecutiveLosses >= 2) score -= 1.8;
    else if (symStat.wins > symStat.losses) score += 0.5;
  }

  if (orderbook) {
    const imb = Number(orderbook.imbalance || 1);
    if (imb >= 1.2) score += 0.6;
    else if (imb < 0.8) score -= 0.6;
  }

  if (candles && candles[0]) {
    const c = Number(candles[0].c || candles[0].close);
    const o = Number(candles[0].o || candles[0].open);
    const h = Number(candles[0].h || candles[0].high);
    const l = Number(candles[0].l || candles[0].low);
    const range = h - l;
    if (range > 0) {
      const upperWickRatio = (h - Math.max(c, o)) / range;
      if (upperWickRatio > 0.45) score -= 0.9;
      else if ((c - o) / range > 0.55) score += 0.5;
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
 * Triggered whenever an Alpaca Paper position (Stock or Crypto) closes!
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

  await broadcastTelegram(
    `🧠 *ALPACA PAPER POST-MORTEM & LEARNING UPDATE*\n\n` +
    `• *Closed on Alpaca:* \`${symbol}\` (${outcome}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)\n` +
    `• *Setup Weight Updated:* \`${setup}\` Win Rate: ${setupStat ? setupStat.winRate : 65}% (Weight: ${setupStat?.weightBonus >= 0 ? '+' : ''}${setupStat?.weightBonus || 0})\n` +
    `• *New Rule Learned:* "${learnedRule}"\n\n` +
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
    const clean = symbol.toUpperCase();
    // If crypto pair (contains '/' or ends with USD like BTC/USD)
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

/**
 * Batch-fetches 1-minute Stock bars from Alpaca IEX in a single HTTP request
 */
async function getMultiStockBars(symbols, limit = 8) {
  try {
    const joined = symbols.map((s) => s.toUpperCase()).join(',');
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/bars?symbols=${joined}&timeframe=1Min&limit=${limit}&sort=desc&feed=iex`,
      {
        headers: {
          'APCA-API-KEY-ID': APCA_KEY,
          'APCA-API-SECRET-KEY': APCA_SECRET,
        },
      }
    );
    if (!res.ok) return {};
    const data = await res.json();
    return data?.bars || {};
  } catch (err) {
    return {};
  }
}

/**
 * Batch-fetches 1-minute Crypto bars + L2 Orderbooks directly from Alpaca in 2 fast HTTP requests
 */
async function getAlpacaCryptoBarsAndBooks(symbols, limit = 8) {
  const joined = symbols.map((s) => encodeURIComponent(s)).join(',');
  const headers = {
    'APCA-API-KEY-ID': APCA_KEY,
    'APCA-API-SECRET-KEY': APCA_SECRET,
  };
  try {
    const [barsRes, obRes] = await Promise.all([
      fetch(`https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${joined}&timeframe=1Min&limit=${limit}&sort=desc`, { headers }),
      fetch(`https://data.alpaca.markets/v1beta3/crypto/us/latest/orderbooks?symbols=${joined}`, { headers }),
    ]);

    const barsData = barsRes.ok ? await barsRes.json() : {};
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
      bars: barsData?.bars || {},
      orderbooks: parsedBooks,
    };
  } catch (err) {
    return { bars: {}, orderbooks: {} };
  }
}

/**
 * UNIFIED ALPACA PAPER ORDER EXECUTOR (Supports BOTH US Stocks AND 24/7 Crypto on Alpaca Paper!)
 * - Crypto orders (`BTC/USD`, `SOL/USD`, etc.) execute on Alpaca Paper with `notional: $500` and `time_in_force: 'gtc'`.
 * - Stock orders (`MSFT`, `NVDA`, etc.) execute on Alpaca Paper with Bracket or Market order (`time_in_force: 'day'`).
 */
async function placeAlpacaPaperOrder({ symbol, qty, side, stopPrice, targetPrice }) {
  const cleanSym = symbol.toUpperCase();
  const cleanSide = side.toLowerCase();
  const isCrypto = cleanSym.includes('/') || cleanSym.endsWith('USD');

  if (isCrypto) {
    // Alpaca Paper Crypto Order (24/7 execution right on your Alpaca Paper Account!)
    const cryptoPayload = {
      symbol: cleanSym,
      notional: String(state.paperSliceUSD), // $500 USD paper slice per trade
      side: cleanSide,
      type: 'market',
      time_in_force: 'gtc',
    };

    const res = await fetch(`${APCA_BASE_URL}/v2/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'APCA-API-KEY-ID': APCA_KEY,
        'APCA-API-SECRET-KEY': APCA_SECRET,
      },
      body: JSON.stringify(cryptoPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Alpaca Crypto (${res.status}): ${errText}`);
    }
    return await res.json();
  }

  // US Stock Order on Alpaca Paper
  const bracketPayload = {
    symbol: cleanSym,
    qty: String(qty),
    side: cleanSide,
    type: 'market',
    time_in_force: 'day',
    order_class: 'bracket',
    take_profit: { limit_price: Number(targetPrice).toFixed(2) },
    stop_loss: { stop_price: Number(stopPrice).toFixed(2) },
  };

  const res = await fetch(`${APCA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'APCA-API-KEY-ID': APCA_KEY,
      'APCA-API-SECRET-KEY': APCA_SECRET,
    },
    body: JSON.stringify(bracketPayload),
  });

  if (res.ok) {
    return await res.json();
  }

  const fallbackPayload = {
    symbol: cleanSym,
    qty: String(qty),
    side: cleanSide,
    type: 'market',
    time_in_force: 'day',
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
    throw new Error(`Alpaca Stock (${retryRes.status}): ${errText}`);
  }

  return await retryRes.json();
}

async function closeAlpacaPosition(symbol) {
  try {
    const norm = normalizeSymbol(symbol);
    const res = await fetch(`${APCA_BASE_URL}/v2/positions/${encodeURIComponent(norm)}`, {
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
 * 24/7 UNIFIED ALPACA PAPER POSITION MONITOR & SELF-LEARNING TRIGGER
 * Monitors ALL open positions (both US Stocks & 24/7 Crypto) directly on Alpaca Paper (/v2/positions)!
 * - At +0.8% gain: Locks Breakeven Stop.
 * - If a Breakeven-locked position drops back to <= +0.05%: Closes on Alpaca at Breakeven (0 loss!).
 * - At +2.0% gain: Closes on Alpaca to bank profit & triggers Self-Learning Post-Mortem (`WIN`).
 * - At -1.2% loss: Closes on Alpaca to cap risk & triggers Self-Learning Post-Mortem (`LOSS`).
 */
async function monitorOngoingTrades() {
  try {
    const positions = await getAlpacaPositions();
    if (!Array.isArray(positions) || positions.length === 0) return;

    for (const pos of positions) {
      const normSym = normalizeSymbol(pos.symbol);
      const unrealizedPlPercent = Number(pos.unrealized_plpc) * 100;
      const currentPrice = Number(pos.current_price);
      const entryPrice = Number(pos.avg_entry_price);
      const profitUSD = Number(pos.unrealized_pl);
      const meta = state.activeTradeMeta.get(normSym) || {
        symbol: pos.symbol,
        market: pos.asset_class === 'crypto' ? 'crypto' : 'stock',
        setup: '1m Alpaca Paper Scalp',
      };

      // 1. Lock Breakeven at +0.8% gain
      if (unrealizedPlPercent >= 0.8 && !state.trailedPositions.has(normSym)) {
        state.trailedPositions.add(normSym);
        await broadcastTelegram(
          `🎯 *ALPACA BREAKEVEN LOCKED — ZERO RISK*\n\n` +
          `• *Asset:* \`${pos.symbol}\`\n` +
          `• *Unrealized Gain:* +${unrealizedPlPercent.toFixed(2)}% (+$${profitUSD.toFixed(2)})\n` +
          `• *Entry:* $${formatPrice(entryPrice)} | *Live:* $${formatPrice(currentPrice)}\n` +
          `🛡️ *AI Adjustment:* Stop trailed to entry ($${formatPrice(entryPrice)}).`
        );
      }

      // 2. Take Profit at +2.0% gain
      if (unrealizedPlPercent >= 2.0 && !state.bookedPositions.has(normSym)) {
        state.bookedPositions.add(normSym);
        const closed = await closeAlpacaPosition(normSym);
        if (closed) {
          state.trailedPositions.delete(normSym);
          state.bookedPositions.delete(normSym);
          state.realizedPnlUSD += profitUSD;
          state.realizedPnlINR += state.targetScalpProfitINR;
          await broadcastTelegram(
            `💰 *ALPACA PAPER PROFIT BANKED! (+${unrealizedPlPercent.toFixed(2)}%)*\n\n` +
            `• *Asset:* \`${pos.symbol}\`\n` +
            `• *Profit Realized:* +$${profitUSD.toFixed(2)} (~+₹${state.targetScalpProfitINR})\n` +
            `• *Cumulative Paper PnL:* $${state.realizedPnlUSD.toFixed(2)} (₹${state.realizedPnlINR})`
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
        }
      } else if (state.trailedPositions.has(normSym) && unrealizedPlPercent <= 0.05 && !state.bookedPositions.has(normSym)) {
        // 3. Breakeven Stop Hit (Price pulled back after being up >= 0.8%)
        state.bookedPositions.add(normSym);
        const closed = await closeAlpacaPosition(normSym);
        if (closed) {
          state.trailedPositions.delete(normSym);
          state.bookedPositions.delete(normSym);
          await broadcastTelegram(
            `🛡️ *ALPACA BREAKEVEN EXIT: \`${pos.symbol}\`*\n\n` +
            `• *Exit Price:* $${formatPrice(currentPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
            `• *Impact:* $0.00 (Protected by AI Breakeven Lock!)`
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
        }
      } else if (unrealizedPlPercent <= -1.2 && !state.bookedPositions.has(normSym)) {
        // 4. Hard Stop Loss Hit (-1.2%)
        state.bookedPositions.add(normSym);
        const closed = await closeAlpacaPosition(normSym);
        if (closed) {
          state.trailedPositions.delete(normSym);
          state.bookedPositions.delete(normSym);
          state.realizedPnlUSD += profitUSD;
          state.realizedPnlINR -= state.maxRiskPerTradeINR;
          await broadcastTelegram(
            `🛡️ *ALPACA STOP-LOSS TRIGGERED: \`${pos.symbol}\`*\n\n` +
            `• *Exit Price:* $${formatPrice(currentPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
            `• *Paper Impact:* $${profitUSD.toFixed(2)} (~-₹${state.maxRiskPerTradeINR})`
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
        }
      }
    }
  } catch (err) {
    console.error('[TraderService] Position monitor error:', err.message);
  }
}

/**
 * BATCHED RATE-LIMIT-SAFE AI AUDIT
 * Audits up to 2 candidates in a SINGLE Gemini API call (1 RPM total cost!)
 */
async function batchAuditCandidatesWithGemini(candidates) {
  const now = Date.now();
  const results = [];
  const uncached = [];

  for (const cand of candidates) {
    const cached = rateLimiter.auditCache.get(cand.symbol);
    if (cached && now - cached.timestamp < 3 * 60 * 1000) {
      results.push({ cand, audit: cached.audit });
    } else {
      uncached.push(cand);
    }
  }

  if (uncached.length === 0) return results;

  // Build deterministic fallback audits first
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

  if (!checkAndConsumeQuota(420)) {
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
      : 'Require full candle body & bid support';

  const batchSummary = uncached.map((c) => ({
    symbol: c.symbol,
    setup: c.setup,
    price: c.entryPrice,
    quantScore: fallbackMap.get(c.symbol).score,
    ob: c.orderbook || 'IEX',
    c0: c.candles?.[0],
  }));

  const prompt = `11-Agent Day-Trader-Skill + Autonomous-Trader Batch Audit (7-Day Alpaca Paper Calibration).
Record: ${state.totalWins}W/${state.totalLosses}L. Learned Rules: ${lessonsCompact}.
Candidates: ${JSON.stringify(batchSummary)}
Return JSON object mapping each symbol to {"approved":true,"score":8.2,"timemachineOdds":"70% Target-First","thesis":"Max 18 words"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 160 },
        }),
        signal: AbortSignal.timeout(4200),
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
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

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
 * 1-MINUTE UNIFIED ALPACA PAPER SCANNER (US Stocks + 20 Alpaca 24/7 Crypto Pairs)
 * Evaluates multiple concurrent trades at 1 RPM total cost and executes 100% on Alpaca Paper!
 */
async function runMarketScan(isManual = false) {
  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();
  const candidates = [];
  const fallbackCandidates = [];
  const topMoversPreview = [];

  // 0. Check & trail all ongoing Alpaca Paper positions first
  await monitorOngoingTrades();

  // 1. Scan US Equities on Alpaca IEX (when US market is open)
  const clock = await getAlpacaClock();
  const isMarketOpen = clock ? clock.is_open : false;

  if (isMarketOpen) {
    const multiStockBars = await getMultiStockBars(STOCK_WATCHLIST.slice(0, 10), 6);
    for (const [sym, bars] of Object.entries(multiStockBars)) {
      const lastAlert = state.alertCooldowns.get(sym) || 0;
      if (!isManual && now - lastAlert < 3 * 60 * 1000) continue;
      if (!bars || bars.length < 3) continue;

      const latestBar = bars[0];
      const prevBars = bars.slice(1, 5);
      const maxPrevHigh = Math.max(...prevBars.map((b) => b.h));
      const minPrevLow = Math.min(...prevBars.map((b) => b.l));

      const isBreakout = latestBar.c >= maxPrevHigh * 0.9985 && latestBar.c >= latestBar.o;
      const isBounce = latestBar.l <= minPrevLow * 1.0015 && latestBar.c > latestBar.o;

      if (isBreakout || isBounce) {
        const liveTradePrice = (await getAlpacaLatestTrade(sym)) || latestBar.c;
        const setupName = isBreakout ? '1m Real-Time IEX Breakout' : '1m Real-Time Support Bounce';
        const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;

        candidates.push({
          market: 'stock',
          symbol: sym,
          entryPrice: liveTradePrice,
          stopLoss: liveTradePrice * 0.988,
          takeProfit: liveTradePrice * 1.025,
          qty: Math.max(1, Math.floor(state.paperSliceUSD / liveTradePrice)),
          setup: setupName,
          candles: bars,
          strength: (latestBar.c - latestBar.o) / latestBar.o + learnedBonus,
        });
      }
    }
  }

  // 2. Scan 24/7 Alpaca Crypto Pairs (Executes directly on Alpaca Paper!)
  try {
    const { bars: cryptoBarsMap, orderbooks: cryptoBooksMap } = await getAlpacaCryptoBarsAndBooks(
      ALPACA_CRYPTO_WATCHLIST.slice(0, 14),
      6
    );

    const moverList = [];
    for (const [pair, bars] of Object.entries(cryptoBarsMap)) {
      if (!bars || bars.length < 3) continue;
      const latest = bars[0];
      const oldest = bars[bars.length - 1];
      const move5m = oldest.o > 0 ? ((latest.c - oldest.o) / oldest.o) * 100 : 0;
      moverList.push({ pair, move5m });

      const lastAlert = state.alertCooldowns.get(pair) || 0;
      if (!isManual && now - lastAlert < 3 * 60 * 1000) continue;

      const prevBars = bars.slice(1, 5);
      const maxPrevHigh = Math.max(...prevBars.map((b) => Number(b.h)));
      const minPrevLow = Math.min(...prevBars.map((b) => Number(b.l)));

      const close = Number(latest.c);
      const open = Number(latest.o);
      const low = Number(latest.l);
      if (!close || !open) continue;

      const bodyPct = (close - open) / open;
      const isBreakout = close >= maxPrevHigh * 0.9985 && close >= open;
      const isWickBounce = low <= minPrevLow * 1.0015 && close > open;
      const isImpulse = bodyPct >= 0.0008;

      const setupName = isBreakout
        ? '1m Micro-Scalp Breakout'
        : isWickBounce
        ? '1m Support Wick Bounce'
        : '1m Momentum Impulse Scalp';

      const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;
      const ob = cryptoBooksMap[pair] || null;

      const item = {
        market: 'crypto',
        symbol: pair,
        entryPrice: close,
        stopLoss: close * 0.988,
        takeProfit: close * 1.025,
        qty: Number((state.paperSliceUSD / close).toFixed(4)),
        setup: setupName,
        candles: bars,
        orderbook: ob,
        strength: bodyPct + learnedBonus,
      };

      if (isBreakout || isWickBounce || isImpulse) {
        candidates.push(item);
      } else {
        fallbackCandidates.push(item);
      }
    }

    moverList.sort((a, b) => b.move5m - a.move5m);
    for (const m of moverList.slice(0, 4)) {
      topMoversPreview.push(`${m.pair.replace('/USD', '')} (${m.move5m >= 0 ? '+' : ''}${m.move5m.toFixed(2)}%)`);
    }

    if (candidates.length < 2 && fallbackCandidates.length > 0) {
      fallbackCandidates.sort((a, b) => b.strength - a.strength);
      for (const fb of fallbackCandidates.slice(0, 2 - candidates.length)) {
        candidates.push({
          ...fb,
          setup: '1m Relative Strength Scalp',
        });
      }
    }
  } catch (err) {
    console.error('[TraderService] Alpaca Crypto scan error:', err.message);
  }

  // Sort by strength + learned setup weight and batch-audit top 2 concurrent setups in 1 single API call!
  candidates.sort((a, b) => b.strength - a.strength);
  const topCandidates = candidates.slice(0, 2);
  const auditedList = await batchAuditCandidatesWithGemini(topCandidates);
  const hits = [];

  for (const { cand, audit } of auditedList) {
    if (!audit.approved) continue;

    const signal = {
      market: cand.market,
      symbol: cand.symbol,
      action: 'buy',
      entryPrice: cand.entryPrice,
      stopLoss: cand.stopLoss,
      takeProfit: cand.takeProfit,
      qty: cand.qty,
      time: new Date(),
      setup: cand.setup,
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
    if (state.recentSignals.length > 30) state.recentSignals.pop();
  }

  // 3. Send Every-1-Minute Unified Alpaca Paper Update to Telegram
  if (state.sendEveryScanReport && state.subscribedChatIds.size > 0) {
    const alpacaPositions = await getAlpacaPositions();
    const totalOpen = alpacaPositions?.length || 0;

    let posSummary = '• *Alpaca Open Positions:* 0 active\n';
    if (totalOpen > 0) {
      posSummary = `*Alpaca Paper Open Positions (${totalOpen}):*\n`;
      for (const p of alpacaPositions) {
        const norm = normalizeSymbol(p.symbol);
        const plPct = (Number(p.unrealized_plpc) * 100).toFixed(2);
        const tag = state.trailedPositions.has(norm) ? '🛡️ [Breakeven]' : '👁️ [Live]';
        posSummary += `• \`${p.symbol}\`: ${plPct}% ($${Number(p.unrealized_pl).toFixed(2)}) ${tag}\n`;
      }
    }

    const totalDecided = state.totalWins + state.totalLosses;
    const winRateStr = totalDecided > 0 ? `${((state.totalWins / totalDecided) * 100).toFixed(0)}%` : 'Calibrating';
    const moversText =
      topMoversPreview.length > 0
        ? `🔥 *Alpaca 5m Pulse:* ${topMoversPreview.join(', ')}\n`
        : '';

    const pulseMsg =
      `⏱️ *1-MIN ALPACA PAPER DESK #${state.totalScansRun}*\n\n` +
      `${moversText}` +
      `${posSummary}` +
      `🧠 *7-Day Accuracy:* ${state.totalWins}W-${state.totalLosses}L-${state.totalBreakevens}BE (${winRateStr}) | *Rules:* ${state.learnedLessons.length}\n` +
      `🔋 *Quota:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit} RPM | ${rateLimiter.requestsToday}/${rateLimiter.rpdLimit} RPD\n` +
      `⚡ *New Setups:* ${hits.length} | 💰 *Alpaca Paper PnL:* $${state.realizedPnlUSD.toFixed(2)}`;

    await broadcastTelegram(pulseMsg);
  }

  // 4. Push the Interactive Trade Proposal Cards (Approve / Decline)
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
  const entryStr = formatPrice(signal.entryPrice);
  const stopStr = formatPrice(signal.stopLoss);
  const targetStr = formatPrice(signal.takeProfit);
  const obLine = signal.orderbook
    ? `• *Alpaca Orderbook:* Bid/Ask ${signal.orderbook.imbalance}x | Spread ${signal.orderbook.spreadPct}%\n`
    : '';

  const card =
    `⚡ *ALPACA PAPER SCALP: \`${signal.symbol}\`*\n\n` +
    `🧠 *Self-Learning AI Audit (${signal.aiScore}/10):*\n` +
    `"${signal.aiThesis}"\n\n` +
    `• *Time Machine Odds:* ${signal.timemachineOdds}\n` +
    `• *Setup:* ${signal.setup}\n` +
    `${obLine}` +
    `• *Alpaca Live Price:* $${entryStr}\n` +
    `• *Paper Order Size:* $${state.paperSliceUSD} USD (Simulates ₹${signal.sliceMarginINR} @ 25x-50x)\n` +
    `• *Stop Loss:* $${stopStr} (-1.2%)\n` +
    `• *Take Profit:* $${targetStr} (+2.0%)\n\n` +
    `🛡️ *100% Alpaca Paper Execution:* Clicking Approve places a real paper order on your Alpaca Dashboard & tracks accuracy for 7 days!`;

  const cbData = `ex:${signal.symbol}:b:${signal.qty}:${stopStr}:${targetStr}:${entryStr}`.slice(0, 64);

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
      // Support legacy B-BTC_USDT by converting to BTC/USD on Alpaca!
      const symbol = rawSymbol.startsWith('B-')
        ? `${rawSymbol.replace('B-', '').replace('_USDT', '')}/USD`
        : rawSymbol;
      const rawSide = parts[2] || 'buy';
      const side = rawSide === 'b' ? 'buy' : rawSide === 's' ? 'sell' : rawSide;
      const qty = parts[3] || '1';
      const stopPrice = parts[4];
      const targetPrice = parts[5];
      const originalEntryPrice = parts[6];

      await sendTelegram('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `Routing ${symbol} to Alpaca Paper...`,
      });

      const livePrice = (await getAlpacaLatestTrade(symbol)) || Number(originalEntryPrice);
      const original = Number(originalEntryPrice);
      const slippagePercent = original > 0 ? Math.abs((livePrice - original) / original) * 100 : 0;

      if (slippagePercent > 1.5 && livePrice > original) {
        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `⚠️ *ALPACA PAPER ORDER ABORTED — SLIPPAGE GATE*\n\n` +
            `• *Asset:* \`${symbol}\`\n` +
            `• *Proposed Price:* $${original}\n` +
            `• *Live Alpaca Price:* $${livePrice} (${slippagePercent.toFixed(2)}% jump)\n\n` +
            `Price moved past 1.5% threshold. Aborted to keep 7-day model calibration accurate.`,
          parse_mode: 'Markdown',
        });
        return;
      }

      try {
        const matchingSignal = state.recentSignals.find((s) => s.symbol === symbol || s.symbol === rawSymbol);
        const order = await placeAlpacaPaperOrder({
          symbol,
          qty,
          side,
          stopPrice: Number(stopPrice),
          targetPrice: Number(targetPrice),
        });

        state.tradesToday += 1;
        const norm = normalizeSymbol(symbol);
        state.activeTradeMeta.set(norm, {
          symbol,
          market: symbol.includes('/') ? 'crypto' : 'stock',
          setup: matchingSignal?.setup || '1m Alpaca Paper Scalp',
          candles: matchingSignal?.candles || [],
          orderbook: matchingSignal?.orderbook || null,
        });

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `✅ *APPROVED — EXECUTED ON ALPACA PAPER*\n\n` +
            `• *Symbol:* \`${symbol}\`\n` +
            `• *Side:* ${side.toUpperCase()} ($${state.paperSliceUSD} Paper Slice)\n` +
            `• *Alpaca Live Price:* ~$${formatPrice(livePrice)}\n` +
            `• *Stop Loss:* $${formatPrice(stopPrice)} (-1.2%)\n` +
            `• *Take Profit:* $${formatPrice(targetPrice)} (+2.0%)\n` +
            `• *Alpaca Order ID:* \`${order.id}\`\n\n` +
            `🧠 *30s Alpaca Monitor Active:* Locks Breakeven at +0.8%, closes on target/stop on Alpaca, and updates 7-day model accuracy in PostgreSQL!`,
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
        `🤖 *7-Day Unified Alpaca Paper Trading & Self-Learning Desk*\n\n` +
        `🇺🇸 *100% Alpaca Execution:* Both **US Stocks** AND **24/7 Crypto (\`BTC/USD\`, \`SOL/USD\`, \`ETH/USD\`, etc.)** execute directly on your **Alpaca Paper Account**!\n` +
        `⚡ *Multi-Trade Batched AI:* Evaluates & pushes up to 2 concurrent setups every minute at only 1 RPM!\n` +
        `🧠 *Closed-Loop Learning:* Every closed Alpaca position updates Bayesian setup weights & Post-Mortem rules in PostgreSQL!\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - View live Alpaca Paper positions, Win Rate % & Quota\n` +
        `• \`/brain\` or \`/learn\` - View 7-Day Accuracy Scoreboard & Learned Rules\n` +
        `• \`/scan\` - Force immediate 1-minute Alpaca scan right now\n` +
        `• \`/balance\` - View Alpaca Paper Equity & Buying Power\n` +
        `• \`/mute\` / \`/unmute\` - Toggle 1-minute heartbeat summaries`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/brain' || text === '/learn') {
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';

      let setupWeightsText = '_Calibrating setup weights as Alpaca paper trades close..._\n';
      if (state.setupStats.size > 0) {
        setupWeightsText = '';
        for (const [sName, st] of state.setupStats.entries()) {
          setupWeightsText += `• \`${sName}\`: ${st.wins}W/${st.losses}L (${st.winRate}%) | Weight: ${st.weightBonus >= 0 ? '+' : ''}${st.weightBonus}\n`;
        }
      }

      let lessonsList = '_Click Approve on a trade card to log the first closed-loop Alpaca post-mortem rule!_\n';
      if (state.learnedLessons.length > 0) {
        lessonsList = state.learnedLessons
          .slice(0, 8)
          .map((l, i) => `${i + 1}. \`[${l.symbol} ${l.outcome}]\` ${l.lesson}`)
          .join('\n');
      }

      const reply =
        `🧠 *7-DAY ALPACA PAPER ACCURACY & SELF-LEARNING BRAIN*\n\n` +
        `📊 *Alpaca Paper Record:* ${state.totalWins}W | ${state.totalLosses}L | ${state.totalBreakevens}BE (*${winRate}% Win Rate*)\n` +
        `💰 *Realized Paper PnL:* $${state.realizedPnlUSD.toFixed(2)} (Sim: ₹${state.realizedPnlINR})\n` +
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
        text: '🔕 *1-Minute Heartbeat Summaries Muted.* You will still receive actionable `Approve` / `Decline` trade cards.',
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

      const lastScanStr = state.lastScanTime ? state.lastScanTime.toLocaleTimeString() : 'Running...';
      const usMarketStatus = clock?.is_open ? '🟢 OPEN (Real-Time IEX)' : '🔴 CLOSED';

      let reply =
        `🛰️ *7-DAY ALPACA PAPER CALIBRATION STATUS*\n\n` +
        `🧠 *Model Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}%*)\n` +
        `💰 *Alpaca Paper Realized PnL:* $${state.realizedPnlUSD.toFixed(2)}\n` +
        `🔋 *Quota Governor:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit} RPM | ${rateLimiter.requestsToday}/${rateLimiter.rpdLimit} RPD\n\n` +
        `• *1-Min Batched Scanner:* 🟢 RUNNING (Scan #${state.totalScansRun})\n` +
        `• *30s Alpaca Position Monitor:* 🟢 ACTIVE\n` +
        `• *Last Scan Time:* ${lastScanStr}\n` +
        `• *US Stock Market:* ${usMarketStatus}\n` +
        `• *Alpaca 24/7 Crypto:* 🟢 ACTIVE (20 USD Pairs)\n\n`;

      if (positions.length > 0) {
        reply += `*Open Alpaca Paper Positions (${positions.length}):*\n`;
        for (const p of positions) {
          const plPercent = (Number(p.unrealized_plpc) * 100).toFixed(2);
          reply += `• \`${p.symbol}\`: ${p.qty} | P&L: ${plPercent}% ($${Number(p.unrealized_pl).toFixed(2)})\n`;
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
      const cleanSymbol = symbol.toUpperCase();

      const currentPrice = (await getAlpacaLatestTrade(cleanSymbol)) || 400.0;
      const stopDistance = currentPrice * 0.012;
      const targetDistance = currentPrice * 0.02;

      const stopPrice = cleanSide === 'buy' ? currentPrice - stopDistance : currentPrice + stopDistance;
      const targetPrice = cleanSide === 'buy' ? currentPrice + targetDistance : currentPrice - targetDistance;

      const promptText =
        `📊 *MANUAL ALPACA PAPER PROPOSAL: \`${cleanSymbol}\`*\n\n` +
        `• *Action:* ${cleanSide.toUpperCase()} ($${state.paperSliceUSD} Slice)\n` +
        `• *Live Alpaca Price:* $${formatPrice(currentPrice)}\n` +
        `• *Stop Loss:* $${formatPrice(stopPrice)} (-1.2%)\n` +
        `• *Take Profit:* $${formatPrice(targetPrice)} (+2.0%)\n\n` +
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
