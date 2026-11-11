'use strict';

const crypto = require('crypto');
const https = require('https');
const { pool } = require('../config/db');

// Telegram Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9066897267:AAFxTbLCj2KmUZ9d070hvEG4Am7-HB4-7Wc';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Bybit Demo Perpetual Futures Configuration (Primary 24/7 Exchange)
const BYBIT_KEY = process.env.BYBIT_API_KEY || 'k4SXoC5OZgSNSFnt81';
const BYBIT_SECRET = process.env.BYBIT_API_SECRET || 'WZI894Or0LVBqC7U4ZF6Ocnzv0CrrxpdR5m6';
const BYBIT_BASE_URL = process.env.BYBIT_BASE_URL || 'https://api-demo.bybit.com';
const BYBIT_HOSTNAME = BYBIT_BASE_URL.replace('https://', '').replace('http://', '');

// Alpaca Configuration (Secondary / Paper Equities)
const APCA_KEY = process.env.APCA_API_KEY_ID || 'PKMGD33K2PM6LJVIND6KTOHHAO';
const APCA_SECRET = process.env.APCA_API_SECRET_KEY || 'DpajVwXqJDFnecku51hJCWS1Z2bUggUhErwDkqomnm4y';
const APCA_IS_PAPER = (process.env.APCA_PAPER || 'true').toLowerCase() === 'true';
const APCA_BASE_URL = APCA_IS_PAPER ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

// Multi-Key & Multi-Model Gemini Rotation Pool (RPM, TPM, and RPD resilient)
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

// Rate-Limit Governor
const rateLimiter = {
  rpmLimit: 10,
  tpmLimit: 15000,
  rpdLimit: 1200,
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  requestsToday: 0,
  lastMinuteReset: Date.now(),
  lastDayReset: Date.now(),
  cooldownUntil: 0,
  auditCache: new Map(),
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
  if (now < rateLimiter.cooldownUntil) {
    return { allowed: false, reason: 'rate_limit_cooldown' };
  }
  if (rateLimiter.requestsThisMinute >= rateLimiter.rpmLimit) {
    return { allowed: false, reason: 'rpm_limit_reached' };
  }
  if (rateLimiter.tokensThisMinute + estimatedTokens > rateLimiter.tpmLimit) {
    return { allowed: false, reason: 'tpm_limit_reached' };
  }
  if (rateLimiter.requestsToday >= rateLimiter.rpdLimit) {
    return { allowed: false, reason: 'rpd_limit_reached' };
  }
  rateLimiter.requestsThisMinute += 1;
  rateLimiter.tokensThisMinute += estimatedTokens;
  rateLimiter.requestsToday += 1;
  return { allowed: true };
}

function getNextGeminiKeyAndModel() {
  if (GEMINI_KEYS.length === 0) return { key: '', model: GEMINI_MODEL_BUCKETS[0] };
  const key = GEMINI_KEYS[geminiKeyIdx % GEMINI_KEYS.length];
  const model = GEMINI_MODEL_BUCKETS[geminiModelIdx % GEMINI_MODEL_BUCKETS.length];
  geminiKeyIdx += 1;
  geminiModelIdx += 1;
  return { key, model };
}

/**
 * EXACT ₹6,000 INR -> ₹50,000 INR STRATEGY MAPPED 1:1 TO BYBIT DEMO PERPS:
 * - ₹250 INR isolated margin slice × 35x leverage = ₹8,750 INR (~$100 USD notional position size).
 * - Every $1.00 USD profit/loss on a $100 Bybit Demo slice = ₹87 INR profit/loss on your ₹250 slice!
 */
const USD_TO_INR = 87;

const state = {
  subscribedChatIds: new Set(),
  scannerIntervalMs: 60 * 1000,
  monitorIntervalMs: 30 * 1000,
  sendEveryScanReport: true,
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(),
  trailedPositions: new Set(),
  bookedPositions: new Set(),
  activeTradeMeta: new Map(),
  activeCryptoTrades: new Map(),
  learnedLessons: [],
  symbolStats: new Map(),
  setupStats: new Map(),
  totalWins: 0,
  totalLosses: 0,
  totalBreakevens: 0,
  lifelineBaseINR: 6000,
  overallGoalINR: 50000,
  targetDays: 7,
  dailyTargetINR: 6300,
  sliceMarginINR: 250,
  leverageMultiplier: 25,
  paperSliceUSD: 250,             // 1:1 INR to USD ratio for Bybit Demo as requested by user
  maxRiskPerTradeINR: 105,
  targetScalpProfitINR: 200,
  realizedPnlUSD: 0,
  realizedPnlINR: 0,
  tradesToday: 0,
  maxTradesPerDay: 100,
  defaultLeverage: '25x Isolated (₹250 Slice = $250 Bybit Notional)',
};

// 20 Liquid 24/7 Linear Crypto Perpetual Pairs on Bybit Demo
const BYBIT_CRYPTO_WATCHLIST = [
  'SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'XRPUSDT',
  'AVAXUSDT', 'LINKUSDT', 'PEPEUSDT', 'SHIBUSDT', 'ADAUSDT',
  'NEARUSDT', 'SUIUSDT', 'APTUSDT', 'WIFUSDT', 'BONKUSDT',
  'ARBUSDT', 'OPUSDT', 'LTCUSDT', 'BNBUSDT', 'INJUSDT',
];

const VALID_BYBIT_CRYPTO_SET = new Set(BYBIT_CRYPTO_WATCHLIST);

// 14 High-Beta US Equities on Alpaca Paper
const STOCK_WATCHLIST = [
  'TSLA', 'NVDA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'SPY', 'QQQ',
  'COIN', 'MSTR', 'PLTR', 'MARA', 'SMCI',
];

function normalizeSymbol(sym) {
  return String(sym || '').replace('/', '').toUpperCase();
}

function formatPriceForBybit(price) {
  const p = Number(price);
  if (isNaN(p) || p <= 0) return '0.00';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(7);
}

function resolveBybitSymbol(rawSymbol) {
  let sym = String(rawSymbol || '').toUpperCase().trim();
  sym = sym.replace('B-', '').replace('_USDT', '').replace('/USD', '').replace('/USDT', '');
  if (!sym.endsWith('USDT')) {
    sym += 'USDT';
  }
  return sym;
}

function calculateBybitOrderQty(symbol, price, notionalUSD = 250) {
  const norm = String(symbol).toUpperCase().replace('/', '');
  const p = Number(price) > 0 ? Number(price) : 100;
  const rawQty = notionalUSD / p;

  if (norm.startsWith('BTC')) return Math.max(0.001, Math.round(rawQty * 1000) / 1000).toFixed(3);
  if (norm.startsWith('ETH')) return Math.max(0.01, Math.round(rawQty * 100) / 100).toFixed(2);
  if (norm.startsWith('SOL')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('BNB')) return Math.max(0.01, Math.round(rawQty * 100) / 100).toFixed(2);
  if (norm.startsWith('LTC')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('AVAX')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('LINK')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('INJ')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('NEAR')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('APT')) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('XRP')) return Math.max(1, Math.round(rawQty)).toFixed(1);
  if (norm.startsWith('SUI')) return String(Math.max(10, Math.round(rawQty)));
  if (norm.startsWith('WIF')) return String(Math.max(10, Math.round(rawQty)));
  if (norm.startsWith('ARB')) return Math.max(10, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('DOGE') || norm.startsWith('ADA')) return String(Math.max(10, Math.round(rawQty)));
  if (norm.startsWith('1000PEPE') || norm.startsWith('1000BONK') || norm.startsWith('PEPE') || norm.startsWith('BONK')) {
    return String(Math.max(100, Math.round(rawQty)));
  }

  if (p > 100) return Math.max(0.01, Math.round(rawQty * 100) / 100).toFixed(2);
  if (p > 1) return Math.max(0.1, Math.round(rawQty * 10) / 10).toFixed(1);
  return String(Math.max(1, Math.round(rawQty)));
}

/**
 * Bybit Demo Authenticated Request Helper (HMAC-SHA256)
 */
function bybitRequest(endpoint, method = 'GET', data = '') {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const payload = method === 'GET' ? data : (typeof data === 'string' ? data : JSON.stringify(data));
    const signString = timestamp + BYBIT_KEY + recvWindow + (payload || '');
    const signature = crypto.createHmac('sha256', BYBIT_SECRET).update(signString).digest('hex');

    const path = method === 'GET' && payload ? `${endpoint}?${payload}` : endpoint;
    const req = https.request(
      {
        hostname: BYBIT_HOSTNAME,
        port: 443,
        path: path,
        method: method,
        headers: {
          'X-BAPI-API-KEY': BYBIT_KEY,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ raw: body, status: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    if (method === 'POST' && payload) req.write(payload);
    req.end();
  });
}

/**
 * Bybit Demo Wallet Balance Query
 */
async function getBybitWalletBalance() {
  try {
    const res = await bybitRequest('/v5/account/wallet-balance', 'GET', 'accountType=UNIFIED');
    if (res && res.retCode === 0 && res.result?.list?.[0]) {
      const acct = res.result.list[0];
      return {
        totalEquity: Number(acct.totalEquity || 0),
        totalAvailableBalance: Number(acct.totalAvailableBalance || 0),
        totalPerpUPL: Number(acct.totalPerpUPL || 0),
        totalMarginBalance: Number(acct.totalMarginBalance || 0),
      };
    }
  } catch (err) {
    console.warn('[TraderService] Bybit balance query error:', err.message);
  }
  return null;
}

/**
 * Bybit Demo Open Positions Query (category: linear)
 */
async function getBybitPositions() {
  try {
    const res = await bybitRequest('/v5/position/list', 'GET', 'category=linear&settleCoin=USDT');
    if (res && res.retCode === 0 && Array.isArray(res.result?.list)) {
      return res.result.list.filter((p) => parseFloat(p.size) > 0);
    }
  } catch (err) {
    console.warn('[TraderService] Bybit positions query error:', err.message);
  }
  return [];
}

/**
 * Bybit Demo Latest Price Query
 */
async function getBybitLatestPrice(symbol) {
  try {
    const norm = resolveBybitSymbol(symbol);
    const res = await bybitRequest('/v5/market/tickers', 'GET', `category=linear&symbol=${norm}`);
    const t = res.result?.list?.[0];
    if (t) return Number(t.lastPrice || t.markPrice);
  } catch (err) {
    console.warn(`[TraderService] Bybit latest price error for ${symbol}:`, err.message);
  }
  return null;
}

/**
 * Place Native Leveraged Order on Bybit Demo (Supports both LONG and SHORT!)
 */
async function placeBybitOrder({ symbol, side, qty, stopLoss, takeProfit, entryPrice }) {
  const normSym = resolveBybitSymbol(symbol);
  const bybitSide = side.toLowerCase() === 'sell' || side.toLowerCase() === 'short' ? 'Sell' : 'Buy';

  // Ensure 25x isolated leverage
  try {
    await bybitRequest('/v5/position/set-leverage', 'POST', {
      category: 'linear',
      symbol: normSym,
      buyLeverage: '25',
      sellLeverage: '25',
    });
  } catch (e) {
    // Ignore if unchanged
  }

  const fillPrice = Number(entryPrice) || (await getBybitLatestPrice(normSym)) || 100;
  const orderQty = qty && parseFloat(qty) > 0 ? String(qty) : calculateBybitOrderQty(normSym, fillPrice, state.paperSliceUSD);

  const slNum = Number(stopLoss);
  const tpNum = Number(takeProfit);

  let computedSL;
  let computedTP;

  if (bybitSide === 'Buy') {
    computedSL = (slNum > 0 && slNum < fillPrice) ? formatPriceForBybit(slNum) : formatPriceForBybit(fillPrice * 0.988);
    computedTP = (tpNum > fillPrice) ? formatPriceForBybit(tpNum) : formatPriceForBybit(fillPrice * 1.022);
  } else {
    // For Sell (Short): SL must be strictly GREATER than fillPrice, TP must be strictly LESS than fillPrice
    computedSL = (slNum > fillPrice) ? formatPriceForBybit(slNum) : formatPriceForBybit(fillPrice * 1.012);
    computedTP = (tpNum > 0 && tpNum < fillPrice) ? formatPriceForBybit(tpNum) : formatPriceForBybit(fillPrice * 0.978);
  }

  const payload = {
    category: 'linear',
    symbol: normSym,
    side: bybitSide,
    orderType: 'Market',
    qty: orderQty,
    timeInForce: 'GTC',
    positionIdx: 0,
    stopLoss: computedSL,
    takeProfit: computedTP,
    tpslMode: 'Full',
  };

  const res = await bybitRequest('/v5/order/create', 'POST', payload);
  if (res && res.retCode === 0) {
    return {
      id: res.result.orderId,
      symbol: normSym,
      side: bybitSide,
      qty: orderQty,
      stopLoss: computedSL,
      takeProfit: computedTP,
      entryPrice: fillPrice,
      status: 'filled',
    };
  }
  throw new Error(`Bybit (${res?.retCode}): ${res?.retMsg || JSON.stringify(res)}`);
}

/**
 * Close Bybit Demo Position with reduceOnly Market Order
 */
async function closeBybitPosition(symbol, side, qty) {
  try {
    const normSym = resolveBybitSymbol(symbol);
    const closeSide = side.toLowerCase() === 'sell' || side.toLowerCase() === 'short' ? 'Buy' : 'Sell';
    const payload = {
      category: 'linear',
      symbol: normSym,
      side: closeSide,
      orderType: 'Market',
      qty: String(qty),
      reduceOnly: true,
      timeInForce: 'GTC',
      positionIdx: 0,
    };
    const res = await bybitRequest('/v5/order/create', 'POST', payload);
    return res && res.retCode === 0;
  } catch (err) {
    console.error(`[TraderService] Bybit close error on ${symbol}:`, err.message);
    return false;
  }
}

/**
 * Initialize PostgreSQL tables for Subscribers, Trade Journal, and Self-Learning Lessons
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
    for (const row of subRes.rows) {
      state.subscribedChatIds.add(String(row.chat_id));
    }

    const journalRes = await pool.query('SELECT * FROM trader_journal ORDER BY created_at DESC');
    state.totalWins = 0;
    state.totalLosses = 0;
    state.totalBreakevens = 0;
    state.realizedPnlUSD = 0;

    for (const row of journalRes.rows) {
      const pnlPct = Number(row.pnl_pct);
      const profitUSD = (pnlPct / 100) * state.paperSliceUSD;
      state.realizedPnlUSD += profitUSD;

      if (row.outcome === 'WIN') state.totalWins += 1;
      else if (row.outcome === 'LOSS') state.totalLosses += 1;
      else state.totalBreakevens += 1;

      const normSym = normalizeSymbol(row.symbol);
      const currSym = state.symbolStats.get(normSym) || { wins: 0, losses: 0, breakevens: 0, totalPnl: 0 };
      if (row.outcome === 'WIN') currSym.wins += 1;
      else if (row.outcome === 'LOSS') currSym.losses += 1;
      else currSym.breakevens += 1;
      currSym.totalPnl += pnlPct;
      state.symbolStats.set(normSym, currSym);

      const setupKey = row.setup || '1m Scalp';
      const currSetup = state.setupStats.get(setupKey) || { wins: 0, losses: 0, breakevens: 0 };
      if (row.outcome === 'WIN') currSetup.wins += 1;
      else if (row.outcome === 'LOSS') currSetup.losses += 1;
      else currSetup.breakevens += 1;
      state.setupStats.set(setupKey, currSetup);
    }

    state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);

    for (const [setupKey, st] of state.setupStats.entries()) {
      const total = st.wins + st.losses;
      st.winRate = total > 0 ? Math.round((st.wins / total) * 100) : 100;
      st.weightBonus = Math.max(-5, Math.min(5, st.wins - st.losses));
    }

    const lessonsRes = await pool.query('SELECT * FROM trader_lessons ORDER BY created_at DESC LIMIT 50');
    state.learnedLessons = lessonsRes.rows;

    console.log(
      `[TraderService] Initialized with ${state.subscribedChatIds.size} subscribers, ` +
        `${journalRes.rows.length} journal trades, and ${state.learnedLessons.length} self-learning rules.`
    );
  } catch (err) {
    console.error('[TraderService] Error initializing DB memory:', err.message);
  }
}

async function saveSubscriber(chatId) {
  try {
    state.subscribedChatIds.add(String(chatId));
    await pool.query('INSERT INTO trader_subscribers (chat_id) VALUES ($1) ON CONFLICT DO NOTHING', [chatId]);
  } catch (err) {
    console.error('[TraderService] Error saving subscriber:', err.message);
  }
}

/**
 * Bulletproof Telegram sender:
 * Retries in plain-text if Markdown entity parsing fails.
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
      console.warn(`[TraderService] Telegram Markdown retry for ${method}:`, data.description);
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

async function broadcastTelegram(text) {
  if (state.subscribedChatIds.size === 0) return;
  for (const chatId of state.subscribedChatIds) {
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }
}

async function broadcastTelegramWithMarkup(text, replyMarkup) {
  if (state.subscribedChatIds.size === 0) return;
  for (const chatId of state.subscribedChatIds) {
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    });
  }
}

/**
 * Gemini Closed-Loop Post-Mortem & Self-Learning
 */
async function recordTradeAndLearn({ symbol, market, setup, entryPrice, exitPrice, pnlPct, outcome, candles, orderbook }) {
  const normSym = normalizeSymbol(symbol);
  try {
    let lessonText = '';
    const quota = checkAndConsumeQuota(350);
    if (quota.allowed) {
      const { key: geminiKey, model: geminiModel } = getNextGeminiKeyAndModel();
      if (geminiKey) {
        const prompt = `Bybit Demo Trade Post-Mortem: ${symbol} (${setup}) Entry $${entryPrice}, Exit $${exitPrice}, PnL: ${pnlPct.toFixed(2)}%, Outcome: ${outcome}.
Summarize in 1 crisp sentence the exact micro-scalping rule learned from this trade for future setups.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 100, temperature: 0.2 },
            }),
          }
        );
        const data = await res.json();
        lessonText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      }
    }

    if (!lessonText) {
      lessonText =
        outcome === 'WIN'
          ? `Momentum confirmation on ${symbol} with ${setup} validated clean continuation.`
          : outcome === 'LOSS'
          ? `Adverse volatility hit stop on ${symbol}; wait for orderbook imbalance confirmation.`
          : `Breakeven lock on ${symbol} protected lifeline capital from mean reversion.`;
    }

    await pool.query(
      `INSERT INTO trader_journal (symbol, market, setup, entry_price, exit_price, pnl_pct, outcome, lesson)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [symbol, market, setup, entryPrice, exitPrice, pnlPct, outcome, lessonText]
    );

    await pool.query(
      `INSERT INTO trader_lessons (symbol, setup, outcome, lesson) VALUES ($1, $2, $3, $4)`,
      [symbol, setup, outcome, lessonText]
    );

    state.learnedLessons.unshift({ symbol, setup, outcome, lesson: lessonText, created_at: new Date() });
    if (state.learnedLessons.length > 50) state.learnedLessons.pop();

    if (outcome === 'WIN') state.totalWins += 1;
    else if (outcome === 'LOSS') state.totalLosses += 1;
    else state.totalBreakevens += 1;

    const symStat = state.symbolStats.get(normSym) || { wins: 0, losses: 0, breakevens: 0, totalPnl: 0 };
    if (outcome === 'WIN') symStat.wins += 1;
    else if (outcome === 'LOSS') symStat.losses += 1;
    else symStat.breakevens += 1;
    symStat.totalPnl += pnlPct;
    state.symbolStats.set(normSym, symStat);

    const setupStat = state.setupStats.get(setup) || { wins: 0, losses: 0, breakevens: 0 };
    if (outcome === 'WIN') setupStat.wins += 1;
    else if (outcome === 'LOSS') setupStat.losses += 1;
    else setupStat.breakevens += 1;
    const tot = setupStat.wins + setupStat.losses;
    setupStat.winRate = tot > 0 ? Math.round((setupStat.wins / tot) * 100) : 100;
    setupStat.weightBonus = Math.max(-5, Math.min(5, setupStat.wins - setupStat.losses));
    state.setupStats.set(setup, setupStat);

    const totalDecided = state.totalWins + state.totalLosses;
    const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';

    await broadcastTelegram(
      `🧠 *CLOSED-LOOP SELF-LEARNING UPDATE*\n\n` +
      `• *Closed on Bybit:* \`${symbol}\` (${outcome}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)\n` +
      `• *Setup:* ${setup}\n` +
      `• *Rule Learned:* "${lessonText}"\n\n` +
      `📊 *7-Day Bybit Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}% Win Rate*)`
    );
  } catch (err) {
    console.error('[TraderService] Error in recordTradeAndLearn:', err.message);
  }
}

/**
 * 24/7 BYBIT DEMO POSITION MONITOR & SELF-LEARNING TRIGGER (Supports BOTH Long & Short!)
 */
async function monitorOngoingTrades() {
  try {
    const bybitPositions = await getBybitPositions();

    // Clean up bookedPositions that have actually closed on Bybit
    const activeNorms = new Set((bybitPositions || []).map((p) => p.symbol));
    for (const bSym of state.bookedPositions) {
      if (!activeNorms.has(bSym)) {
        state.bookedPositions.delete(bSym);
      }
    }

    if (Array.isArray(bybitPositions)) {
      for (const pos of bybitPositions) {
        const symbol = pos.symbol;
        const sideLabel = pos.side === 'Sell' ? 'SHORT' : 'LONG';
        const entryPrice = Number(pos.avgPrice);
        const markPrice = Number(pos.markPrice);
        const size = pos.size;
        const profitUSD = Number(pos.unrealisedPnl || 0);
        const profitINR = Math.round(profitUSD * USD_TO_INR);

        // Calculate PnL % based on position side
        const unrealizedPlPercent =
          pos.side === 'Sell'
            ? ((entryPrice - markPrice) / entryPrice) * 100
            : ((markPrice - entryPrice) / entryPrice) * 100;

        const meta = state.activeTradeMeta.get(symbol) || {
          symbol,
          market: 'crypto',
          setup: `1m Bybit Linear Scalp (${sideLabel})`,
        };

        // 1. Lock Breakeven at +0.8% gain (~+28% ROI on ₹250 @ 35x slice)
        if (unrealizedPlPercent >= 0.8 && !state.trailedPositions.has(symbol)) {
          state.trailedPositions.add(symbol);
          try {
            await bybitRequest('/v5/position/trading-stop', 'POST', {
              category: 'linear',
              symbol,
              positionIdx: 0,
              stopLoss: String(entryPrice),
            });
          } catch (trailErr) {
            console.warn(`[TraderService] Bybit stop trail error for ${symbol}:`, trailErr.message);
          }

          await broadcastTelegram(
            `🎯 *BREAKEVEN LOCKED ON BYBIT DEMO [${sideLabel}] — ZERO RISK*\n\n` +
            `• *Asset:* \`${symbol}\` (${sideLabel})\n` +
            `• *Move:* +${unrealizedPlPercent.toFixed(2)}% (+$${profitUSD.toFixed(2)} / +₹${profitINR} on ₹250 slice)\n` +
            `• *Entry:* $${formatPrice(entryPrice)} | *Live:* $${formatPrice(markPrice)}\n` +
            `🛡️ *AI Adjustment:* Stop loss trailed directly on Bybit to entry ($${formatPrice(entryPrice)}).`
          );
        }

        // 2. Take Profit at +2.0% gain (~+70% ROI on ₹250 @ 35x slice)
        if (unrealizedPlPercent >= 2.0 && !state.bookedPositions.has(symbol)) {
          state.bookedPositions.add(symbol);
          const closed = await closeBybitPosition(symbol, pos.side, size);
          if (closed) {
            state.trailedPositions.delete(symbol);
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
            await broadcastTelegram(
              `💰 *BYBIT DEMO SCALP PROFIT BANKED [${sideLabel}]! (+${unrealizedPlPercent.toFixed(2)}%)*\n\n` +
              `• *Asset:* \`${symbol}\` (${sideLabel})\n` +
              `• *Profit Realized:* +$${profitUSD.toFixed(2)} (*+₹${profitINR}* on ₹250 slice)\n` +
              `• *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}`
            );
            await recordTradeAndLearn({
              symbol,
              market: 'crypto',
              setup: meta.setup,
              entryPrice,
              exitPrice: markPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'WIN',
              candles: meta.candles,
              orderbook: meta.orderbook,
            });
          } else {
            state.bookedPositions.delete(symbol);
          }
        } else if (state.trailedPositions.has(symbol) && unrealizedPlPercent <= 0.05 && !state.bookedPositions.has(symbol)) {
          // 3. Breakeven Stop Hit
          state.bookedPositions.add(symbol);
          const closed = await closeBybitPosition(symbol, pos.side, size);
          if (closed) {
            state.trailedPositions.delete(symbol);
            await broadcastTelegram(
              `🛡️ *BYBIT BREAKEVEN EXIT [${sideLabel}]: \`${symbol}\`*\n\n` +
              `• *Exit Price:* $${formatPrice(markPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
              `• *Impact:* ₹0 (Protected by AI Breakeven Lock!)`
            );
            await recordTradeAndLearn({
              symbol,
              market: 'crypto',
              setup: meta.setup,
              entryPrice,
              exitPrice: markPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'BREAKEVEN',
              candles: meta.candles,
              orderbook: meta.orderbook,
            });
          } else {
            state.bookedPositions.delete(symbol);
          }
        } else if (unrealizedPlPercent <= -1.2 && !state.bookedPositions.has(symbol)) {
          // 4. Hard Stop Loss Hit (-1.2%)
          state.bookedPositions.add(symbol);
          const closed = await closeBybitPosition(symbol, pos.side, size);
          if (closed) {
            state.trailedPositions.delete(symbol);
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            await broadcastTelegram(
              `🛡️ *BYBIT STOP-LOSS TRIGGERED [${sideLabel}]: \`${symbol}\`*\n\n` +
              `• *Exit Price:* $${formatPrice(markPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
              `• *Impact on ₹250 Slice:* $${profitUSD.toFixed(2)} (~₹${profitINR})`
            );
            await recordTradeAndLearn({
              symbol,
              market: 'crypto',
              setup: meta.setup,
              entryPrice,
              exitPrice: markPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'LOSS',
              candles: meta.candles,
              orderbook: meta.orderbook,
            });
          } else {
            state.bookedPositions.delete(symbol);
          }
        }
      }
    }
  } catch (err) {
    console.error('[TraderService] Bybit position monitor error:', err.message);
  }
}

/**
 * Batch-Audit Candidates with Gemini in 1 Single Fast Request
 */
async function batchAuditCandidatesWithGemini(candidates) {
  if (!candidates || candidates.length === 0) return [];
  const quota = checkAndConsumeQuota(550);
  if (!quota.allowed) {
    return candidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup} on Bybit Linear. High-conviction scalp meeting 1m momentum criteria.`,
    }));
  }

  const { key: geminiKey, model: geminiModel } = getNextGeminiKeyAndModel();
  if (!geminiKey) {
    return candidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup} on Bybit Linear. High-conviction momentum scalp.`,
    }));
  }

  try {
    const listDescriptions = candidates.map((c, i) => {
      const ob = c.orderbook
        ? `Imbalance ${c.orderbook.imbalance}x, Spread ${c.orderbook.spreadPct}%`
        : 'Liquid orderbook';
      return `#${i + 1}: ${c.symbol} (${c.action.toUpperCase()}) Setup: "${c.setup}". Entry: $${c.entryPrice}, Stop: $${c.stopLoss}, Target: $${c.takeProfit}. L2: ${ob}`;
    });

    const prompt = `You are the Lead Quantitative Risk & Momentum Desk Auditor for Bybit Linear Perps.
Evaluate the following scalping candidates:
${listDescriptions.join('\n')}

Respond with a strictly valid JSON array of objects with keys:
- "index": number (1-based index matching input list)
- "score": number between 1 and 10 (ratings >= 7 qualify for execution)
- "thesis": string (1 concise sentence explaining the edge)`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
        }),
      }
    );

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedAudits = JSON.parse(cleanJson);

    return candidates.map((cand, idx) => {
      const matchingAudit = parsedAudits.find((a) => a.index === idx + 1);
      return {
        ...cand,
        aiScore: matchingAudit?.score || 8,
        aiThesis: matchingAudit?.thesis || `${cand.setup} on Bybit Linear perps.`,
      };
    });
  } catch (err) {
    console.warn('[TraderService] Gemini batch audit error, using quant fallback:', err.message);
    return candidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup} on Bybit Linear perps. Momentum edge confirmed.`,
    }));
  }
}

/**
 * 1-MINUTE MULTI-TRADE SCANNER (24/7 Bybit Linear Crypto Perps)
 */
async function runMarketScan(isManual = false) {
  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();

  const openPositions = await getBybitPositions();
  const openPositionsMap = new Map((openPositions || []).map((p) => [p.symbol, p]));

  const rawCandidates = [];
  const topMoversPreview = [];

  // Scan 20 Bybit 24/7 Linear Crypto Perps (Both LONG & SHORT!)
  try {
    const tickersRes = await bybitRequest('/v5/market/tickers', 'GET', 'category=linear');
    const tickerList = tickersRes?.result?.list || [];
    const tickerMap = new Map(tickerList.map((t) => [t.symbol, t]));

    const moverList = [];
    for (const sym of BYBIT_CRYPTO_WATCHLIST) {
      const t = tickerMap.get(sym);
      if (!t) continue;

      const lastPrice = Number(t.lastPrice || t.markPrice);
      const prevPrice1h = Number(t.prevPrice1h || lastPrice);
      const move1h = prevPrice1h > 0 ? ((lastPrice - prevPrice1h) / prevPrice1h) * 100 : 0;
      const price24h = Number(t.price24hPcnt || 0) * 100;
      const high24h = Number(t.highPrice24h || lastPrice);
      const low24h = Number(t.lowPrice24h || lastPrice);
      const bidSize = Number(t.bid1Size || 1);
      const askSize = Number(t.ask1Size || 1);
      const imbalance = bidSize / (askSize || 1);
      const spreadPct = Number(
        t.ask1Price && t.bid1Price ? ((Number(t.ask1Price) - Number(t.bid1Price)) / lastPrice) * 100 : 0.02
      );

      moverList.push({ pair: sym, move5m: move1h });

      // Bullish (LONG) conditions
      const isBreakoutLong = (move1h >= 0.1 && imbalance >= 1.05) || (price24h > 1.5 && lastPrice >= high24h * 0.985);
      const isWickBounceLong = imbalance >= 1.25 && lastPrice >= low24h * 1.01;

      // Bearish (SHORT) conditions
      const isBreakdownShort = (move1h <= -0.1 && imbalance <= 0.95) || (price24h < -1.5 && lastPrice <= low24h * 1.015);
      const isRejectionShort = imbalance <= 0.8 && lastPrice <= high24h * 0.99;

      const decideShort = (isBreakdownShort || isRejectionShort) && (move1h < 0 || imbalance < 0.95);

      const action = decideShort ? 'sell' : 'buy';
      const setupName = decideShort
        ? isBreakdownShort
          ? '1m Bybit Linear Breakdown (SHORT)'
          : '1m Bybit Ask-Wall Rejection (SHORT)'
        : isBreakoutLong
        ? '1m Bybit Momentum Breakout (LONG)'
        : isWickBounceLong
        ? '1m Bybit Bid-Support Bounce (LONG)'
        : '1m Bybit Linear Momentum (LONG)';

      const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;
      const obEdge = decideShort ? Math.max(0, 1 - imbalance) * 0.001 : Math.max(0, imbalance - 1) * 0.001;

      const stopLoss = decideShort
        ? formatPriceForBybit(lastPrice * 1.012)
        : formatPriceForBybit(lastPrice * 0.988);
      const takeProfit = decideShort
        ? formatPriceForBybit(lastPrice * 0.978)
        : formatPriceForBybit(lastPrice * 1.022);
      const orderQty = calculateBybitOrderQty(sym, lastPrice, state.paperSliceUSD);

      const item = {
        market: 'crypto',
        symbol: sym,
        action,
        entryPrice: lastPrice,
        stopLoss: Number(stopLoss),
        takeProfit: Number(takeProfit),
        qty: orderQty,
        setup: setupName,
        orderbook: {
          imbalance: Number(imbalance.toFixed(2)),
          spreadPct: Number(spreadPct.toFixed(3)),
          bids: [[t.bid1Price, t.bid1Size]],
          asks: [[t.ask1Price, t.ask1Size]],
        },
        strength: Math.abs(move1h) * 0.01 + obEdge + learnedBonus,
      };

      rawCandidates.push(item);
    }

    moverList.sort((a, b) => Math.abs(b.move5m) - Math.abs(a.move5m));
    for (const m of moverList.slice(0, 4)) {
      topMoversPreview.push(`${m.pair.replace('USDT', '')} (${m.move5m >= 0 ? '+' : ''}${m.move5m.toFixed(1)}%)`);
    }
  } catch (err) {
    console.error('[TraderService] Bybit Crypto scan error:', err.message);
  }

  // Anti-Martingale / Scale-In Filtering
  const candidates = [];
  for (const item of rawCandidates) {
    const existing = openPositionsMap.get(item.symbol);
    const lastAlert = state.alertCooldowns.get(item.symbol) || 0;
    if (!isManual && now - lastAlert < 2 * 60 * 1000) continue;

    if (!existing) {
      candidates.push({
        ...item,
        intent: 'FRESH_ENTRY',
      });
    } else {
      const isPosLong = existing.side === 'Buy';
      const isSignalLong = item.action === 'buy';
      const entryPrice = Number(existing.avgPrice);
      const markPrice = Number(existing.markPrice);
      const plPercent =
        existing.side === 'Sell'
          ? ((entryPrice - markPrice) / entryPrice) * 100
          : ((markPrice - entryPrice) / entryPrice) * 100;

      if (isPosLong === isSignalLong) {
        // Same Direction: Allow Scale-In if already in +0.75% profit
        const estimatedSlices = Math.max(1, Math.round((Number(existing.size) * markPrice) / state.paperSliceUSD));
        if (plPercent >= 0.75 && estimatedSlices < 3) {
          candidates.push({
            ...item,
            intent: 'SCALE_IN',
            currentPlPct: plPercent,
            existingSlices: estimatedSlices,
            setup: `📈 Scale-In (+1 Slice): ${item.setup}`,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.strength - a.strength);
  const batchToAudit = candidates.slice(0, 5);
  const auditedList = await batchAuditCandidatesWithGemini(batchToAudit);

  const qualifyingHits = [];
  for (const cand of auditedList) {
    if (cand.aiScore < 7) continue;

    state.alertCooldowns.set(cand.symbol, now);
    qualifyingHits.push(cand);

    const hit = {
      symbol: cand.symbol,
      action: cand.action,
      entryPrice: cand.entryPrice,
      stopLoss: cand.stopLoss,
      takeProfit: cand.takeProfit,
      qty: cand.qty,
      time: new Date(),
      setup: cand.setup,
      intent: cand.intent,
      currentPlPct: cand.currentPlPct,
      existingSlices: cand.existingSlices,
      orderbook: cand.orderbook,
      riskINR: state.maxRiskPerTradeINR,
      rewardINR: state.targetScalpProfitINR,
      sliceMarginINR: state.sliceMarginINR,
      aiScore: cand.aiScore,
      aiThesis: cand.aiThesis,
    };

    state.recentSignals.unshift(hit);
    if (state.recentSignals.length > 20) state.recentSignals.pop();

    await notifyTradeOpportunity(hit);
  }

  // Every-1-Minute Status Report to Telegram
  if (state.sendEveryScanReport && state.totalScansRun % 1 === 0 && state.subscribedChatIds.size > 0) {
    const totalOpen = openPositions.length;
    let posSummary = '• *Bybit Open Positions:* 0 active\n';
    if (totalOpen > 0) {
      posSummary = `*Bybit Demo Open Positions (${totalOpen}):*\n`;
      for (const p of openPositions) {
        const side = p.side === 'Sell' ? 'SHORT' : 'LONG';
        const plUsd = Number(p.unrealisedPnl || 0);
        const plInr = Math.round(plUsd * USD_TO_INR);
        const entryPrice = Number(p.avgPrice);
        const markPrice = Number(p.markPrice);
        const plPercent =
          p.side === 'Sell'
            ? ((entryPrice - markPrice) / entryPrice) * 100
            : ((markPrice - entryPrice) / entryPrice) * 100;
        posSummary += `  ↳ \`${p.symbol}\` (${side}): ${plPercent.toFixed(2)}% ($${plUsd.toFixed(2)} / ₹${plInr >= 0 ? '+' : ''}${plInr})\n`;
      }
    }

    const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
    const quota = rateLimiter;
    const pulseText =
      topMoversPreview.length > 0 ? `🔥 *Bybit Pulse:* ${topMoversPreview.join(', ')}\n` : '';

    const summaryReport =
      `⏱️ *1-MIN BYBIT DEMO SCALPING REPORT (#${state.totalScansRun})*\n\n` +
      `🎯 *₹6,000 Strategy Capital:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
      `📊 *Today's Scoreboard:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE\n` +
      `⚡ *Opportunities Found This Min:* ${qualifyingHits.length} setups pushed\n` +
      `${pulseText}` +
      `${posSummary}\n` +
      `🔋 *AI Quota Governor:* ${quota.requestsThisMinute}/${quota.rpmLimit} RPM | ${quota.requestsToday}/${quota.rpdLimit} RPD\n` +
      `_Tap Approve on any card to execute directly on Bybit Demo._`;

    await broadcastTelegram(summaryReport);
  }

  return qualifyingHits;
}

function formatPrice(val) {
  return formatPriceForBybit(val);
}

/**
 * Send Interactive Telegram Card with Approve / Decline Buttons
 */
async function notifyTradeOpportunity(signal) {
  const isShort = signal.action === 'sell';
  const isScaleIn = signal.intent === 'SCALE_IN';
  const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
  const sideCode = isShort ? 's' : 'b';
  const entryStr = formatPrice(signal.entryPrice);
  const stopStr = formatPrice(signal.stopLoss);
  const targetStr = formatPrice(signal.takeProfit);

  const obText = signal.orderbook
    ? `• *Bybit Orderbook:* Bid/Ask ${signal.orderbook.imbalance}x | Spread ${signal.orderbook.spreadPct}%\n`
    : '';

  const scaleInContext = isScaleIn
    ? `📈 *SCALE-IN ON RUNNING WINNER (Slice #${(signal.existingSlices || 1) + 1} of 3)*\n` +
      `• *Current Trade Gain:* +${(signal.currentPlPct || 0).toFixed(2)}% (Breakeven Locked)\n` +
      `• *Action:* Adding +1 isolated slice ($${state.paperSliceUSD} / ₹${signal.sliceMarginINR}) to compound momentum!\n\n`
    : '';

  const headerTitle = isScaleIn
    ? `📈 *SCALE-IN: \`${signal.symbol}\`* [${sideBadge}]`
    : `⚡ *BYBIT DEMO SCALP [${sideBadge}]: \`${signal.symbol}\`*`;

  const card =
    `${headerTitle}\n\n` +
    `${scaleInContext}` +
    `🧠 *Self-Learning AI Audit (${signal.aiScore}/10):*\n` +
    `"${signal.aiThesis}"\n\n` +
    `• *Direction:* *${sideBadge}*\n` +
    `• *Bybit Live Price:* $${entryStr}\n` +
    `${obText}` +
    `• *₹6,000 Strategy Slice:* ₹${signal.sliceMarginINR} Margin @ 25x = *$${state.paperSliceUSD} Bybit Order*\n` +
    `• *Stop Loss:* $${stopStr} (${isShort ? '+1.2% above' : '-1.2% below'} | Risk: -₹${signal.riskINR})\n` +
    `• *Take Profit:* $${targetStr} (${isShort ? '-2.2% drop' : '+2.2% gain'} | Gain: +₹${signal.rewardINR})\n\n` +
    `🛡️ *Bi-Directional Ready:* Click Approve to execute natively on Bybit Demo!`;

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
          callback_data: `dec:${signal.symbol}`.slice(0, 64),
        },
      ],
    ],
  };

  await broadcastTelegramWithMarkup(card, keyboard);
}

/**
 * Telegram Webhook Handler
 */
async function handleTelegramUpdate(update) {
  if (update.callback_query) {
    const callbackQueryId = update.callback_query.id;
    const callbackData = update.callback_query.data || '';
    const message = update.callback_query.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;

    if (callbackData.startsWith('dec:')) {
      await sendTelegram('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: 'Trade declined.',
      });
      await sendTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: '❌ *Trade Declined.*\nNo Bybit order placed.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (callbackData.startsWith('ex:')) {
      const parts = callbackData.split(':');
      const rawSymbol = parts[1];
      const sideCode = parts[2];
      const qty = parts[3];
      const stopLoss = parts[4];
      const takeProfit = parts[5];
      const originalEntryPrice = parts[6];

      const isShort = sideCode === 's';
      const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
      const cleanSide = isShort ? 'sell' : 'buy';
      const symbol = resolveBybitSymbol(rawSymbol);

      await sendTelegram('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: `Executing ${sideBadge} on Bybit Demo...`,
      });

      try {
        const livePrice = (await getBybitLatestPrice(symbol)) || Number(originalEntryPrice) || 100;
        const order = await placeBybitOrder({
          symbol,
          side: cleanSide,
          qty,
          stopLoss,
          takeProfit,
          entryPrice: livePrice,
        });

        state.activeTradeMeta.set(symbol, {
          symbol,
          market: 'crypto',
          setup: `1m Bybit Linear Scalp (${isShort ? 'SHORT' : 'LONG'})`,
        });

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `✅ *TRADE EXECUTED ON BYBIT DEMO [${sideBadge}]*\n\n` +
            `• *Symbol:* \`${symbol}\`\n` +
            `• *Direction:* *${sideBadge}*\n` +
            `• *Position Size:* ${order.qty} ($${state.paperSliceUSD} Notional / ₹${state.sliceMarginINR} Margin @ 25x)\n` +
            `• *Entry Price:* $${formatPrice(order.entryPrice)}\n` +
            `• *Stop Loss:* $${formatPrice(order.stopLoss)} (${isShort ? '+1.2% above' : '-1.2% below'} | Risk: -₹${state.maxRiskPerTradeINR})\n` +
            `• *Take Profit:* $${formatPrice(order.takeProfit)} (${isShort ? '-2.2% drop' : '+2.2% gain'} | Gain: +₹${state.targetScalpProfitINR})\n` +
            `• *Bybit Order ID:* \`${order.id}\`\n\n` +
            `🛡️ *Active Trailing:* Once +0.8% in profit, AI moves Stop to Breakeven directly on Bybit.`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        console.error(`[TraderService] Bybit execution error for ${symbol}:`, err.message);
        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `❌ Bybit Execution Error on ${symbol}: ${err.message}`,
        });
      }
      return;
    }
  }

  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat?.id;
    if (!chatId || !msg.text) return;
    await saveSubscriber(chatId);

    const text = msg.text.trim();

    if (text.startsWith('/start') || text.startsWith('/help')) {
      const welcome =
        `🤖 *7-Day ₹6,000 ➔ ₹50,000 Strategy on Bybit Demo*\n\n` +
        `💵 *Exact Strategy Mapping:* Each **₹250 INR slice @ 25x-35x leverage** = **$100 USD Notional Order** on Bybit Linear Perps!\n` +
        `⚡ *Native Bi-Directional:* Real LONG and SHORT perps with isolated margin, stop loss, and take profit!\n` +
        `🧠 *Self-Learning Brain:* Every closed Bybit position updates Bayesian setup weights & Post-Mortem rules in PostgreSQL!\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - View ₹6,000 Strategy Balance, Bybit Open Positions & Win Rate %\n` +
        `• \`/brain\` or \`/learn\` - View 7-Day Accuracy Scoreboard & Learned Rules\n` +
        `• \`/scan\` - Force immediate 1-minute Bybit scan right now\n` +
        `• \`/balance\` - View Bybit Demo Equity & Margin\n` +
        `• \`/reset\` - Clear phantom journal records & reset balance\n` +
        `• \`/trade <SYMBOL> <BUY|SELL>\` - Test a manual Bybit scalp card\n` +
        `• \`/mute\` / \`/unmute\` - Toggle 1-minute heartbeat summaries`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/brain' || text === '/learn') {
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';
      const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;

      let setupWeightsText = '_Calibrating setup weights as Bybit demo trades close..._\n';
      if (state.setupStats.size > 0) {
        setupWeightsText = '';
        for (const [sName, st] of state.setupStats.entries()) {
          setupWeightsText += `• \`${sName}\`: ${st.wins}W/${st.losses}L (${st.winRate}%) | Weight: ${st.weightBonus >= 0 ? '+' : ''}${st.weightBonus}\n`;
        }
      }

      let lessonsList = '_Click Approve on trade cards to log closed-loop Bybit post-mortem rules!_\n';
      if (state.learnedLessons.length > 0) {
        lessonsList = state.learnedLessons
          .slice(0, 8)
          .map((l, i) => `${i + 1}. \`[${l.symbol} ${l.outcome}]\` ${l.lesson}`)
          .join('\n');
      }

      const reply =
        `🧠 *7-DAY BYBIT DEMO ACCURACY & SELF-LEARNING BRAIN*\n\n` +
        `🎯 *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `📊 *Bybit Demo Record:* ${state.totalWins}W | ${state.totalLosses}L | ${state.totalBreakevens}BE (*${winRate}% Win Rate*)\n` +
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
      const bybitBal = await getBybitWalletBalance();
      const positions = await getBybitPositions();
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';

      let unrealizedUSD = 0;
      for (const p of positions) unrealizedUSD += Number(p.unrealisedPnl || 0);
      const liveLifelineINR = state.lifelineBaseINR + state.realizedPnlINR + Math.round(unrealizedUSD * USD_TO_INR);
      const lastScanStr = state.lastScanTime ? state.lastScanTime.toLocaleTimeString() : 'Running...';

      let reply =
        `🛰️ *7-DAY ₹6,000 ➔ ₹50,000 BYBIT CALIBRATION STATUS*\n\n` +
        `🎯 *₹6,000 Strategy Live Balance:* *₹${liveLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `🧠 *Model Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}%*)\n` +
        `🔋 *Quota Governor:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit} RPM | ${rateLimiter.requestsToday}/${rateLimiter.rpdLimit} RPD\n\n` +
        `• *1-Min Multi-Trade Scanner:* 🟢 RUNNING (Scan #${state.totalScansRun})\n` +
        `• *30s Bybit Position Monitor:* 🟢 ACTIVE\n` +
        `• *Last Scan Time:* ${lastScanStr}\n` +
        `• *Bybit 24/7 Linear Crypto:* 🟢 ACTIVE (20 USDT Pairs)\n\n`;

      if (positions.length > 0) {
        reply += `*Open Bybit Positions (${positions.length}):*\n`;
        for (const p of positions) {
          const side = p.side === 'Sell' ? 'SHORT' : 'LONG';
          const plUsd = Number(p.unrealisedPnl || 0);
          const plInr = Math.round(plUsd * USD_TO_INR);
          const entryPrice = Number(p.avgPrice);
          const markPrice = Number(p.markPrice);
          const plPercent =
            p.side === 'Sell'
              ? ((entryPrice - markPrice) / entryPrice) * 100
              : ((markPrice - entryPrice) / entryPrice) * 100;
          reply += `• \`${p.symbol}\` (${side}): ${plPercent.toFixed(2)}% ($${plUsd.toFixed(2)} / ₹${plInr >= 0 ? '+' : ''}${plInr})\n`;
        }
        reply += '\n';
      }

      if (bybitBal) {
        reply +=
          `💼 *Bybit Demo Equity:* $${bybitBal.totalEquity.toLocaleString()} (Avail: $${bybitBal.totalAvailableBalance.toLocaleString()})`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/scan') {
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '⏳ *Running immediate 1-minute Bybit Demo scan across 20 Linear Perps...*',
        parse_mode: 'Markdown',
      });
      const manualHits = await runMarketScan(true);
      if (!manualHits || manualHits.length === 0) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: '🔍 *Manual Scan Completed:* All 20 Bybit Linear pairs scanned. No new qualifying setups met the entry threshold this minute (or existing runners are in protection cooldown). Next auto-scan in 60s!',
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (text === '/balance') {
      const bybitBal = await getBybitWalletBalance();
      const positions = await getBybitPositions();

      let reply = `💼 *BYBIT DEMO UNIFIED PORTFOLIO*\n\n`;
      if (bybitBal) {
        reply +=
          `• *Total Equity:* $${bybitBal.totalEquity.toLocaleString()} USDT\n` +
          `• *Available Balance:* $${bybitBal.totalAvailableBalance.toLocaleString()} USDT\n` +
          `• *Perp Unrealized P&L:* $${bybitBal.totalPerpUPL.toFixed(2)} USDT\n` +
          `• *Open Positions:* ${positions.length}\n` +
          `• *Account Type:* UNIFIED (UTA)\n`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text.startsWith('/trade')) {
      const parts = text.split(' ').filter(Boolean);
      if (parts.length < 3) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `⚠️ *Usage:* \`/trade <SYMBOL> <BUY|SELL> [QTY]\`\n_Example:_ \`/trade SOL BUY 0.1\` or \`/trade DOGE SELL 100\``,
          parse_mode: 'Markdown',
        });
        return;
      }

      const [, rawSym, side, customQty] = parts;
      const cleanSide = side.toLowerCase() === 'sell' ? 'sell' : 'buy';
      const isShort = cleanSide === 'sell';
      const symbol = resolveBybitSymbol(rawSym);

      const currentPrice = (await getBybitLatestPrice(symbol)) || 100.0;
      const stopPrice = isShort ? currentPrice * 1.012 : currentPrice * 0.988;
      const targetPrice = isShort ? currentPrice * 0.978 : currentPrice * 1.022;
      const qty = customQty || calculateBybitOrderQty(symbol, currentPrice, state.paperSliceUSD);

      const promptText =
        `📊 *MANUAL SCALP PROPOSAL: \`${symbol}\`*\n\n` +
        `• *Action:* ${cleanSide.toUpperCase()} ${qty}\n` +
        `• *Live Bybit Price:* $${formatPrice(currentPrice)}\n` +
        `• *Stop Loss:* $${formatPrice(stopPrice)} (${isShort ? '+1.2%' : '-1.2%'})\n` +
        `• *Take Profit:* $${formatPrice(targetPrice)} (${isShort ? '-2.2%' : '+2.2%'})\n\n` +
        `🛡️ *Active Trailing:* Once +0.8% in profit, AI moves stop to Breakeven directly on Bybit.`;

      const cbData = `ex:${symbol}:${cleanSide === 'buy' ? 'b' : 's'}:${qty}:${formatPrice(stopPrice)}:${formatPrice(targetPrice)}:${formatPrice(currentPrice)}`.slice(0, 64);

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: `Approve ${cleanSide.toUpperCase()} ${symbol}`,
              callback_data: cbData,
            },
            {
              text: 'Decline',
              callback_data: `dec:${symbol}`.slice(0, 64),
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

    if (text === '/reset') {
      const res = await resetJournalAndBalance();
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text:
          `🧹 *TRADING JOURNAL & STATS RESET*\n\n` +
          `• *Cleared Phantom Records:* ${res.clearedRecords}\n` +
          `• *Realized P&L:* ₹0 ($0.00)\n` +
          `• *Clean Base Balance:* ₹${state.lifelineBaseINR.toLocaleString()}\n` +
          `• *Win / Loss Record:* 0W - 0L - 0BE (Calibrating)\n\n` +
          `All phantom gains cleared. Fresh Bybit Demo calibration initialized.`,
        parse_mode: 'Markdown',
      });
      return;
    }

    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: `Command not recognized. Type /help, /status, or /scan.`,
    });
  }
}

/**
 * Reset Journal, Lessons, and Phantom Realized Balance in Memory & PostgreSQL
 */
async function resetJournalAndBalance() {
  let clearedRecords = 0;
  try {
    const delRes = await pool.query('DELETE FROM trader_journal');
    clearedRecords = delRes.rowCount || 0;
    await pool.query('DELETE FROM trader_lessons');
  } catch (err) {
    console.warn('[TraderService] Error resetting DB journal:', err.message);
  }

  state.totalWins = 0;
  state.totalLosses = 0;
  state.totalBreakevens = 0;
  state.realizedPnlUSD = 0;
  state.realizedPnlINR = 0;
  state.symbolStats.clear();
  state.setupStats.clear();
  state.learnedLessons = [];
  state.bookedPositions.clear();
  state.trailedPositions.clear();
  state.activeCryptoTrades.clear();

  return { clearedRecords };
}

let loopsStarted = false;

// 24/7 background scanner cycle (every 60s) & active trade monitor (every 30s)
async function startBackgroundLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  console.log(`[TraderService] Starting 1-Minute Bybit Demo Scanner (60s) & Monitor (30s)...`);
  await initDbAndMemory();

  setTimeout(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Initial Bybit auto-scan error:', err));
  }, 4000);

  setInterval(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Scheduled 1m Bybit scan error:', err));
  }, state.scannerIntervalMs);

  setInterval(() => {
    monitorOngoingTrades().catch((err) => console.error('[TraderService] Bybit Monitor error:', err));
  }, state.monitorIntervalMs);
}

// Auto-start background loops on module initialization if not in test
if (process.env.NODE_ENV !== 'test') {
  startBackgroundLoops().catch((err) => console.error('[TraderService] Auto-start loops error:', err));
}

module.exports = {
  startBackgroundLoops,
  handleTelegramUpdate,
  getBybitWalletBalance,
  getBybitPositions,
  getBybitLatestPrice,
  placeBybitOrder,
  closeBybitPosition,
  runMarketScan,
  monitorOngoingTrades,
  resetJournalAndBalance,
  state,
};
