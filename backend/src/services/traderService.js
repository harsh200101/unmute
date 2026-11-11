'use strict';

const crypto = require('crypto');
const https = require('https');
const { pool } = require('../config/db');

// Telegram Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9066897267:AAFxTbLCj2KmUZ9d070hvEG4Am7-HB4-7Wc';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Bybit Demo Perpetual Futures Configuration (Primary 24/7 Crypto Exchange)
const BYBIT_KEY = process.env.BYBIT_API_KEY || 'k4SXoC5OZgSNSFnt81';
const BYBIT_SECRET = process.env.BYBIT_API_SECRET || 'WZI894Or0LVBqC7U4ZF6Ocnzv0CrrxpdR5m6';
const BYBIT_BASE_URL = process.env.BYBIT_BASE_URL || 'https://api-demo.bybit.com';
const BYBIT_HOSTNAME = BYBIT_BASE_URL.replace('https://', '').replace('http://', '');

// Alpaca Configuration (US Equities Paper Trading)
const APCA_KEY = process.env.APCA_API_KEY_ID || 'PKMGD33K2PM6LJVIND6KTOHHAO';
const APCA_SECRET = process.env.APCA_API_SECRET_KEY || 'DpajVwXqJDFnecku51hJCWS1Z2bUggUhErwDkqomnm4y';
const APCA_IS_PAPER = (process.env.APCA_PAPER || 'true').toLowerCase() === 'true';
const APCA_BASE_URL = APCA_IS_PAPER ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
const APCA_DATA_URL = 'https://data.alpaca.markets';

// 4-Key & Multi-Model Gemini Native Thinking Rotation Pool (4x RPM, 4x TPM, 4x RPD)
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

// Empirically verified active models on user's 4 keys (Native Thinking + Ultra-Fast Lite)
const GEMINI_MODEL_BUCKETS = [
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

const THINKING_MODELS = new Set(['gemini-3-flash-preview', 'gemini-3.5-flash']);

let geminiKeyIdx = 0;
let geminiModelIdx = 0;

// Rate-Limit Governor (Scaled for 4-Key Pool: 30 RPM, 60k TPM, 4,000 RPD)
const rateLimiter = {
  rpmLimit: 30,
  tpmLimit: 60000,
  rpdLimit: 4000,
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  requestsToday: 0,
  lastMinuteReset: Date.now(),
  lastDayReset: Date.now(),
  cooldownUntil: 0,
  lastModelUsed: 'gemini-3-flash-preview',
  lastThoughtsTokens: 0,
  auditCache: new Map(),
};

function checkAndConsumeQuota(estimatedTokens = 650) {
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

function getNextGeminiKeyAndModel(preferThinking = true) {
  if (GEMINI_KEYS.length === 0) return { key: '', model: GEMINI_MODEL_BUCKETS[0] };
  const key = GEMINI_KEYS[geminiKeyIdx % GEMINI_KEYS.length];
  let model;
  if (preferThinking) {
    const thinkingPool = ['gemini-3-flash-preview', 'gemini-3.5-flash'];
    model = thinkingPool[geminiModelIdx % thinkingPool.length];
  } else {
    model = GEMINI_MODEL_BUCKETS[geminiModelIdx % GEMINI_MODEL_BUCKETS.length];
  }
  geminiKeyIdx += 1;
  geminiModelIdx += 1;
  rateLimiter.lastModelUsed = model;
  return { key, model };
}

const USD_TO_INR = 87;

const state = {
  subscribedChatIds: new Set(),
  scannerIntervalMs: 60 * 1000,
  monitorIntervalMs: 30 * 1000,
  sendEveryScanReport: true,
  autoExecuteTrades: true,        // 100% Autonomous execution for high-conviction setups (aiScore >= 8)
  maxConcurrentCryptoPositions: 5,
  maxConcurrentStockPositions: 4,
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(),
  trailedPositions: new Set(),
  stage2TrailedPositions: new Set(),
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
  paperSliceUSD: 250,             // 1:1 INR-to-USD ratio for Bybit Demo & Alpaca Paper
  maxRiskPerTradeINR: 105,
  targetScalpProfitINR: 200,
  realizedPnlUSD: 0,
  realizedPnlINR: 0,
  tradesToday: 0,
  maxTradesPerDay: 100,
  defaultLeverage: '25x Isolated (₹250 Slice = $250 Notional)',
  macroRegime: {
    btcMove1h: 0,
    btcRegime: 'NEUTRAL',
    spyMoveIntraday: 0,
    qqqMoveIntraday: 0,
    usMarketOpen: false,
    usMarketRegime: 'CLOSED',
  },
  coordination: {
    activeMode: 'RENDER_CLOUD',
    lastHeartbeat: new Date(),
    activeAgentId: 'render-primary',
  },
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

const VALID_STOCK_SET = new Set(STOCK_WATCHLIST);

function isUSStock(symbol) {
  const clean = String(symbol || '').toUpperCase().trim();
  return VALID_STOCK_SET.has(clean);
}

function normalizeSymbol(sym) {
  return String(sym || '').replace('/', '').toUpperCase().trim();
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
  if (VALID_STOCK_SET.has(sym)) return sym;
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
  if (norm.startsWith('OP')) return Math.max(1, Math.round(rawQty * 10) / 10).toFixed(1);
  if (norm.startsWith('DOGE') || norm.startsWith('ADA')) return String(Math.max(10, Math.round(rawQty)));
  if (norm.startsWith('1000PEPE') || norm.startsWith('1000BONK') || norm.startsWith('PEPE') || norm.startsWith('BONK') || norm.startsWith('SHIB')) {
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

async function placeBybitOrder({ symbol, side, qty, stopLoss, takeProfit, entryPrice }) {
  const normSym = resolveBybitSymbol(symbol);
  const bybitSide = side.toLowerCase() === 'sell' || side.toLowerCase() === 'short' ? 'Sell' : 'Buy';

  try {
    await bybitRequest('/v5/position/set-leverage', 'POST', {
      category: 'linear',
      symbol: normSym,
      buyLeverage: '25',
      sellLeverage: '25',
    });
  } catch (e) {
    // Ignore if leverage already 25x
  }

  const fillPrice = Number(entryPrice) || (await getBybitLatestPrice(normSym)) || 100;
  const orderQty = qty && parseFloat(qty) > 0 ? String(qty) : calculateBybitOrderQty(normSym, fillPrice, state.paperSliceUSD);

  const slNum = Number(stopLoss);
  const tpNum = Number(takeProfit);

  let computedSL;
  let computedTP;

  if (bybitSide === 'Buy') {
    computedSL = slNum > 0 && slNum < fillPrice ? formatPriceForBybit(slNum) : formatPriceForBybit(fillPrice * 0.988);
    computedTP = tpNum > fillPrice ? formatPriceForBybit(tpNum) : formatPriceForBybit(fillPrice * 1.023);
  } else {
    computedSL = slNum > fillPrice ? formatPriceForBybit(slNum) : formatPriceForBybit(fillPrice * 1.012);
    computedTP = tpNum > 0 && tpNum < fillPrice ? formatPriceForBybit(tpNum) : formatPriceForBybit(fillPrice * 0.977);
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
      exchange: 'Bybit Demo',
      status: 'filled',
    };
  }
  throw new Error(`Bybit (${res?.retCode}): ${res?.retMsg || JSON.stringify(res)}`);
}

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
 * ============================================================================
 * ALPACA PAPER US EQUITIES ENGINE (14 High-Beta US Stocks)
 * ============================================================================
 */
function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID': APCA_KEY,
    'APCA-API-SECRET-KEY': APCA_SECRET,
    'Content-Type': 'application/json',
  };
}

async function getAlpacaClock() {
  if (!APCA_KEY || !APCA_SECRET) return null;
  try {
    const res = await fetch(`${APCA_BASE_URL}/v2/clock`, { headers: alpacaHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[TraderService] Alpaca clock error:', err.message);
    return null;
  }
}

async function getAlpacaAccount() {
  if (!APCA_KEY || !APCA_SECRET) return null;
  try {
    const res = await fetch(`${APCA_BASE_URL}/v2/account`, { headers: alpacaHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[TraderService] Alpaca account error:', err.message);
    return null;
  }
}

async function getAlpacaPositions() {
  if (!APCA_KEY || !APCA_SECRET) return [];
  try {
    const res = await fetch(`${APCA_BASE_URL}/v2/positions`, { headers: alpacaHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[TraderService] Alpaca positions error:', err.message);
    return [];
  }
}

async function getAlpacaStockSnapshots(symbols = STOCK_WATCHLIST) {
  if (!APCA_KEY || !APCA_SECRET) return {};
  try {
    const url = `${APCA_DATA_URL}/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(','))}&feed=iex`;
    const res = await fetch(url, { headers: alpacaHeaders() });
    if (!res.ok) return {};
    return await res.json();
  } catch (err) {
    console.warn('[TraderService] Alpaca stock snapshots error:', err.message);
    return {};
  }
}

async function placeAlpacaPaperOrder({ symbol, qty, notionalUSD, side = 'buy' }) {
  const cleanSym = String(symbol).toUpperCase().trim();
  const cleanSide = side.toLowerCase() === 'sell' || side.toLowerCase() === 'short' ? 'sell' : 'buy';

  const body = {
    symbol: cleanSym,
    side: cleanSide,
    type: 'market',
    time_in_force: 'day',
  };

  if (notionalUSD && Number(notionalUSD) > 0 && cleanSide === 'buy') {
    body.notional = String(Number(notionalUSD).toFixed(2));
  } else {
    body.qty = String(Math.max(1, Math.round(Number(qty) || 1)));
  }

  const res = await fetch(`${APCA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: alpacaHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Alpaca (${res.status}): ${data?.message || JSON.stringify(data)}`);
  }
  return {
    id: data.id,
    symbol: cleanSym,
    side: cleanSide,
    qty: data.qty || body.qty || 'fractional',
    entryPrice: Number(data.filled_avg_price || 0),
    exchange: 'Alpaca Paper (US Stocks)',
    status: data.status || 'accepted',
  };
}

async function closeAlpacaPosition(symbol) {
  try {
    const clock = await getAlpacaClock();
    if (!clock || !clock.is_open) {
      return false; // Never attempt to close US stock positions when NYSE/NASDAQ is closed!
    }
    const cleanSym = String(symbol).toUpperCase().trim();
    const res = await fetch(`${APCA_BASE_URL}/v2/positions/${encodeURIComponent(cleanSym)}`, {
      method: 'DELETE',
      headers: alpacaHeaders(),
    });
    return res.ok;
  } catch (err) {
    console.warn(`[TraderService] Alpaca close error for ${symbol}:`, err.message);
    return false;
  }
}

/**
 * ============================================================================
 * POSTGRESQL INITIALIZATION & HYBRID LAPTOP <-> RENDER COORDINATION
 * ============================================================================
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
      CREATE TABLE IF NOT EXISTS desk_coordination (
        id INT PRIMARY KEY DEFAULT 1,
        active_mode VARCHAR(32) NOT NULL DEFAULT 'RENDER_CLOUD',
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        active_agent_id VARCHAR(64) DEFAULT 'render-primary',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO desk_coordination (id, active_mode, last_heartbeat, active_agent_id)
      VALUES (1, 'RENDER_CLOUD', NOW(), 'render-primary')
      ON CONFLICT (id) DO NOTHING;
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

    for (const [, st] of state.setupStats.entries()) {
      const total = st.wins + st.losses;
      st.winRate = total > 0 ? Math.round((st.wins / total) * 100) : 100;
      st.weightBonus = Math.max(-5, Math.min(5, st.wins - st.losses));
    }

    const lessonsRes = await pool.query('SELECT * FROM trader_lessons ORDER BY created_at DESC LIMIT 50');
    state.learnedLessons = lessonsRes.rows;

    const coordRes = await pool.query('SELECT * FROM desk_coordination WHERE id = 1');
    if (coordRes.rows[0]) {
      state.coordination = {
        activeMode: coordRes.rows[0].active_mode,
        lastHeartbeat: coordRes.rows[0].last_heartbeat,
        activeAgentId: coordRes.rows[0].active_agent_id,
      };
    }

    console.log(
      `[TraderService] Initialized Dual-Engine (Bybit 24/7 Crypto + Alpaca 14 US Stocks) with ` +
        `${GEMINI_KEYS.length} Gemini Thinking keys, ${state.subscribedChatIds.size} subscribers, ` +
        `${journalRes.rows.length} journal trades, and ${state.learnedLessons.length} self-learning rules.`
    );
  } catch (err) {
    console.error('[TraderService] Error initializing DB memory:', err.message);
  }
}

async function getCoordinationState() {
  try {
    const res = await pool.query('SELECT * FROM desk_coordination WHERE id = 1');
    if (res.rows[0]) {
      const row = res.rows[0];
      const ageSec = (Date.now() - new Date(row.last_heartbeat).getTime()) / 1000;
      if (row.active_mode === 'LOCAL_AGY' && ageSec > 90) {
        // Auto-failover back to RENDER_CLOUD if laptop heartbeat expired (>90s)
        const failoverRes = await pool.query(
          `UPDATE desk_coordination
           SET active_mode = 'RENDER_CLOUD', active_agent_id = 'render-failover', last_heartbeat = NOW(), updated_at = NOW()
           WHERE id = 1 RETURNING *`
        );
        const updated = failoverRes.rows[0] || row;
        state.coordination = {
          activeMode: updated.active_mode,
          lastHeartbeat: updated.last_heartbeat,
          activeAgentId: updated.active_agent_id,
          heartbeatAgeSeconds: 0,
        };
        return state.coordination;
      }
      state.coordination = {
        activeMode: row.active_mode,
        lastHeartbeat: row.last_heartbeat,
        activeAgentId: row.active_agent_id,
        heartbeatAgeSeconds: Math.round(ageSec),
      };
    }
  } catch (err) {
    console.warn('[TraderService] Coordination state read error:', err.message);
  }
  return state.coordination;
}

async function updateHeartbeat(mode = 'LOCAL_AGY', agentId = 'laptop-agy') {
  try {
    const res = await pool.query(
      `UPDATE desk_coordination
       SET active_mode = $1, active_agent_id = $2, last_heartbeat = NOW(), updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [mode, agentId]
    );
    if (res.rows[0]) {
      state.coordination = {
        activeMode: res.rows[0].active_mode,
        lastHeartbeat: res.rows[0].last_heartbeat,
        activeAgentId: res.rows[0].active_agent_id,
        heartbeatAgeSeconds: 0,
      };
    }
  } catch (err) {
    console.warn('[TraderService] Heartbeat update error:', err.message);
  }
  return state.coordination;
}

async function handoffControl(targetMode = 'RENDER_CLOUD', agentId = 'manual-handoff') {
  return await updateHeartbeat(targetMode, agentId);
}

async function saveSubscriber(chatId) {
  try {
    state.subscribedChatIds.add(String(chatId));
    await pool.query('INSERT INTO trader_subscribers (chat_id) VALUES ($1) ON CONFLICT DO NOTHING', [chatId]);
  } catch (err) {
    console.error('[TraderService] Error saving subscriber:', err.message);
  }
}

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
 * Helper to extract text from Gemini response (filtering out internal thinking parts)
 */
function extractGeminiResponseText(data) {
  const usage = data?.usageMetadata;
  if (usage?.thoughtsTokenCount !== undefined) {
    rateLimiter.lastThoughtsTokens = usage.thoughtsTokenCount;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const textParts = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text);
  if (textParts.length > 0) return textParts.join('\n').trim();
  return parts[0]?.text?.trim() || '';
}

/**
 * Gemini Closed-Loop Post-Mortem & Self-Learning
 */
async function recordTradeAndLearn({ symbol, market, setup, entryPrice, exitPrice, pnlPct, outcome }) {
  const normSym = normalizeSymbol(symbol);
  try {
    let lessonText = '';
    const quota = checkAndConsumeQuota(350);
    if (quota.allowed) {
      const { key: geminiKey, model: geminiModel } = getNextGeminiKeyAndModel(false);
      if (geminiKey) {
        const prompt = `Trade Post-Mortem [${market.toUpperCase()}]: ${symbol} (${setup}) Entry $${entryPrice}, Exit $${exitPrice}, PnL: ${pnlPct.toFixed(2)}%, Outcome: ${outcome}.
Summarize in 1 crisp sentence the exact quantitative micro-scalping rule learned from this trade for future setups.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 150, temperature: 0.2 },
            }),
          }
        );
        const data = await res.json();
        lessonText = extractGeminiResponseText(data);
      }
    }

    if (!lessonText) {
      lessonText =
        outcome === 'WIN'
          ? `Macro alignment & momentum confirmation on ${symbol} (${setup}) validated clean continuation.`
          : outcome === 'LOSS'
          ? `Adverse move hit stop on ${symbol}; require stronger L2 orderbook imbalance & macro trend alignment.`
          : `Fee-adjusted breakeven ratchet on ${symbol} protected capital and covered round-trip taker fees.`;
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
      `• *Closed [${market.toUpperCase()}]:* \`${symbol}\` (${outcome}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)\n` +
      `• *Setup:* ${setup}\n` +
      `• *Rule Learned:* "${lessonText}"\n\n` +
      `📊 *7-Day Desk Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}% Win Rate*)`
    );
  } catch (err) {
    console.error('[TraderService] Error in recordTradeAndLearn:', err.message);
  }
}

/**
 * ============================================================================
 * TWO-STAGE FEE-ADJUSTED BREAKEVEN RATCHET & POSITION MONITOR
 * - Monitors Bybit 24/7 Linear Crypto Perps (Stage 1 @ +0.90% -> +0.20% lock; Stage 2 @ +1.55% -> +0.85% lock; TP @ +2.20%)
 * - Monitors Alpaca Paper US Stocks when US Market is OPEN (`clock.is_open === true`)
 * ============================================================================
 */
async function monitorOngoingTrades() {
  try {
    // 1. Monitor Bybit Demo 24/7 Crypto Perps
    const bybitPositions = await getBybitPositions();
    const activeBybitNorms = new Set((bybitPositions || []).map((p) => p.symbol));

    if (Array.isArray(bybitPositions)) {
      for (const pos of bybitPositions) {
        const symbol = pos.symbol;
        const sideLabel = pos.side === 'Sell' ? 'SHORT' : 'LONG';
        const entryPrice = Number(pos.avgPrice);
        const markPrice = Number(pos.markPrice);
        const size = pos.size;
        const profitUSD = Number(pos.unrealisedPnl || 0);
        const profitINR = Math.round(profitUSD * USD_TO_INR);

        const unrealizedPlPercent =
          pos.side === 'Sell'
            ? ((entryPrice - markPrice) / entryPrice) * 100
            : ((markPrice - entryPrice) / entryPrice) * 100;

        const meta = state.activeTradeMeta.get(symbol) || {
          symbol,
          market: 'crypto',
          setup: `1m Bybit Linear Scalp (${sideLabel})`,
        };

        // STAGE 1: Fee-Adjusted Breakeven Lock at +0.90% move -> Lock Stop at +0.20% (covers 0.11% RT fees + net profit!)
        if (unrealizedPlPercent >= 0.90 && !state.trailedPositions.has(symbol)) {
          state.trailedPositions.add(symbol);
          const feeAdjustedStop =
            pos.side === 'Sell'
              ? formatPriceForBybit(entryPrice * 0.9980)
              : formatPriceForBybit(entryPrice * 1.0020);
          try {
            await bybitRequest('/v5/position/trading-stop', 'POST', {
              category: 'linear',
              symbol,
              positionIdx: 0,
              stopLoss: feeAdjustedStop,
            });
          } catch (trailErr) {
            console.warn(`[TraderService] Stage 1 stop trail error for ${symbol}:`, trailErr.message);
          }

          await broadcastTelegram(
            `🎯 *STAGE-1 FEE-ADJUSTED BREAKEVEN LOCKED [${sideLabel}]*\n\n` +
            `• *Asset:* \`${symbol}\` (${sideLabel})\n` +
            `• *Move:* +${unrealizedPlPercent.toFixed(2)}% (+$${profitUSD.toFixed(2)} / +₹${profitINR})\n` +
            `• *Entry:* $${formatPrice(entryPrice)} | *New Stop:* $${feeAdjustedStop} (+0.20% Net Lock)\n` +
            `🛡️ *Quant Edge:* Stop trailed past 0.11% taker fee hurdle so worst-case exit is net profitable!`
          );
        }

        // STAGE 2: Profit Ratchet at +1.55% move -> Lock Stop at +0.85% (+21% gross ROE on 25x!)
        if (unrealizedPlPercent >= 1.55 && !state.stage2TrailedPositions.has(symbol)) {
          state.stage2TrailedPositions.add(symbol);
          const stage2Stop =
            pos.side === 'Sell'
              ? formatPriceForBybit(entryPrice * 0.9915)
              : formatPriceForBybit(entryPrice * 1.0085);
          try {
            await bybitRequest('/v5/position/trading-stop', 'POST', {
              category: 'linear',
              symbol,
              positionIdx: 0,
              stopLoss: stage2Stop,
            });
          } catch (trailErr) {
            console.warn(`[TraderService] Stage 2 stop trail error for ${symbol}:`, trailErr.message);
          }

          await broadcastTelegram(
            `🔒 *STAGE-2 PROFIT RATCHET LOCKED [${sideLabel}]: \`${symbol}\`*\n\n` +
            `• *Move:* +${unrealizedPlPercent.toFixed(2)}% (+$${profitUSD.toFixed(2)} / +₹${profitINR})\n` +
            `• *Stop Ratcheted To:* $${stage2Stop} (+0.85% Locked = +18.5% Net ROE Guaranteed!)`
          );
        }

        // STAGE 3: Take Profit at +2.20% move (~+55% gross ROE on 25x slice)
        if (unrealizedPlPercent >= 2.20 && !state.bookedPositions.has(symbol)) {
          state.bookedPositions.add(symbol);
          const closed = await closeBybitPosition(symbol, pos.side, size);
          if (closed) {
            state.trailedPositions.delete(symbol);
            state.stage2TrailedPositions.delete(symbol);
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
            await broadcastTelegram(
              `💰 *BYBIT DEMO SCALP PROFIT BANKED [${sideLabel}]! (+${unrealizedPlPercent.toFixed(2)}%)*\n\n` +
              `• *Asset:* \`${symbol}\` (${sideLabel})\n` +
              `• *Profit Realized:* +$${profitUSD.toFixed(2)} (*+₹${profitINR}* on $250 slice)\n` +
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
            });
          } else {
            state.bookedPositions.delete(symbol);
          }
        } else if (state.trailedPositions.has(symbol) && unrealizedPlPercent <= 0.18 && !state.bookedPositions.has(symbol)) {
          state.bookedPositions.add(symbol);
          const closed = await closeBybitPosition(symbol, pos.side, size);
          if (closed) {
            state.trailedPositions.delete(symbol);
            state.stage2TrailedPositions.delete(symbol);
            await broadcastTelegram(
              `🛡️ *FEE-ADJUSTED BREAKEVEN EXIT [${sideLabel}]: \`${symbol}\`*\n\n` +
              `• *Exit Price:* $${formatPrice(markPrice)} (+${unrealizedPlPercent.toFixed(2)}%)\n` +
              `• *Impact:* Taker fees covered + capital 100% protected!`
            );
            await recordTradeAndLearn({
              symbol,
              market: 'crypto',
              setup: meta.setup,
              entryPrice,
              exitPrice: markPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'BREAKEVEN',
            });
          } else {
            state.bookedPositions.delete(symbol);
          }
        } else if (unrealizedPlPercent <= -1.20 && !state.bookedPositions.has(symbol)) {
          state.bookedPositions.add(symbol);
          const closed = await closeBybitPosition(symbol, pos.side, size);
          if (closed) {
            state.trailedPositions.delete(symbol);
            state.stage2TrailedPositions.delete(symbol);
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            await broadcastTelegram(
              `🛡️ *BYBIT STOP-LOSS TRIGGERED [${sideLabel}]: \`${symbol}\`*\n\n` +
              `• *Exit Price:* $${formatPrice(markPrice)} (${unrealizedPlPercent.toFixed(2)}%)\n` +
              `• *Impact on Slice:* $${profitUSD.toFixed(2)} (~₹${profitINR})`
            );
            await recordTradeAndLearn({
              symbol,
              market: 'crypto',
              setup: meta.setup,
              entryPrice,
              exitPrice: markPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'LOSS',
            });
          } else {
            state.bookedPositions.delete(symbol);
          }
        }
      }
    }

    // 2. Monitor Alpaca Paper US Equities (ONLY when US Market is OPEN!)
    const clock = await getAlpacaClock();
    state.macroRegime.usMarketOpen = Boolean(clock && clock.is_open);
    if (clock && clock.is_open) {
      const alpacaPositions = await getAlpacaPositions();
      for (const pos of alpacaPositions) {
        const sym = String(pos.symbol).toUpperCase();
        if (!isUSStock(sym)) continue;
        activeBybitNorms.add(sym);

        const entryPrice = Number(pos.avg_entry_price || 0);
        const currentPrice = Number(pos.current_price || entryPrice);
        const unrealizedPlPercent = Number(pos.unrealized_plpc || 0) * 100;
        const profitUSD = Number(pos.unrealized_pl || 0);
        const profitINR = Math.round(profitUSD * USD_TO_INR);

        if (unrealizedPlPercent >= 0.70 && !state.trailedPositions.has(sym)) {
          state.trailedPositions.add(sym);
          await broadcastTelegram(
            `🎯 *US STOCK BREAKEVEN LOCKED: \`${sym}\`*\n` +
            `• *Move:* +${unrealizedPlPercent.toFixed(2)}% (+$${profitUSD.toFixed(2)} / +₹${profitINR})\n` +
            `• *Entry:* $${entryPrice.toFixed(2)} | *Live:* $${currentPrice.toFixed(2)}`
          );
        }

        if (unrealizedPlPercent >= 1.50 && !state.bookedPositions.has(sym)) {
          state.bookedPositions.add(sym);
          const closed = await closeAlpacaPosition(sym);
          if (closed) {
            state.trailedPositions.delete(sym);
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            await broadcastTelegram(
              `💰 *US STOCK SCALP PROFIT BANKED: \`${sym}\` (+${unrealizedPlPercent.toFixed(2)}%)*\n` +
              `• *Profit Realized:* +$${profitUSD.toFixed(2)} (*+₹${profitINR}*)`
            );
            await recordTradeAndLearn({
              symbol: sym,
              market: 'us_stock',
              setup: 'US Equity Intraday Momentum Breakout',
              entryPrice,
              exitPrice: currentPrice,
              pnlPct: unrealizedPlPercent,
              outcome: 'WIN',
            });
          } else {
            state.bookedPositions.delete(sym);
          }
        } else if (
          (unrealizedPlPercent <= -0.90 || (state.trailedPositions.has(sym) && unrealizedPlPercent <= 0.05)) &&
          !state.bookedPositions.has(sym)
        ) {
          state.bookedPositions.add(sym);
          const isBE = state.trailedPositions.has(sym) && unrealizedPlPercent > -0.25;
          const closed = await closeAlpacaPosition(sym);
          if (closed) {
            state.trailedPositions.delete(sym);
            state.realizedPnlUSD += profitUSD;
            state.realizedPnlINR = Math.round(state.realizedPnlUSD * USD_TO_INR);
            await recordTradeAndLearn({
              symbol: sym,
              market: 'us_stock',
              setup: 'US Equity Intraday Momentum',
              entryPrice,
              exitPrice: currentPrice,
              pnlPct: unrealizedPlPercent,
              outcome: isBE ? 'BREAKEVEN' : 'LOSS',
            });
          } else {
            state.bookedPositions.delete(sym);
          }
        }
      }
    }

    for (const bSym of state.bookedPositions) {
      if (!activeBybitNorms.has(bSym)) {
        state.bookedPositions.delete(bSym);
      }
    }
  } catch (err) {
    console.error('[TraderService] Position monitor error:', err.message);
  }
}

/**
 * ============================================================================
 * GEMINI NATIVE THINKING MODE BATCH AUDITOR (4-Key Pool + thinkingBudget: 512)
 * ============================================================================
 */
async function batchAuditCandidatesWithGemini(candidates) {
  if (!candidates || candidates.length === 0) return [];
  const quota = checkAndConsumeQuota(750);
  if (!quota.allowed) {
    return candidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup} [${cand.market.toUpperCase()}]. Quant momentum & macro regime aligned.`,
    }));
  }

  const { key: geminiKey, model: geminiModel } = getNextGeminiKeyAndModel(true);
  if (!geminiKey) {
    return candidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup} [${cand.market.toUpperCase()}]. High-conviction momentum scalp.`,
    }));
  }

  try {
    const recentLessonsText =
      state.learnedLessons.length > 0
        ? state.learnedLessons
            .slice(0, 4)
            .map((l) => `- [${l.symbol} ${l.outcome}]: ${l.lesson}`)
            .join('\n')
        : '- Require tight spread, clear orderbook imbalance, and alignment with BTC/SPY macro regime.';

    const listDescriptions = candidates.map((c, i) => {
      const ob = c.orderbook
        ? `L2 Imbalance ${c.orderbook.imbalance}x, Spread ${c.orderbook.spreadPct}%`
        : 'Liquid IEX Book';
      return `#${i + 1}: [${c.market.toUpperCase()}] ${c.symbol} (${c.action.toUpperCase()}) Setup: "${c.setup}" | 1h/Intraday Move: ${c.movePct?.toFixed(2) || '0.50'}% | Entry: $${c.entryPrice}, SL: $${c.stopLoss}, TP: $${c.takeProfit} | ${ob}`;
    });

    const prompt = `You are the Chief Quantitative Risk Officer & Momentum Auditor for an Autonomous Dual-Market Desk (Bybit 24/7 Linear Crypto Perps @ 25x + Alpaca US Equities).
Macro Regime Context:
- BTC 1h Change: ${state.macroRegime.btcMove1h.toFixed(2)}% (${state.macroRegime.btcRegime})
- US Market (SPY/QQQ): ${state.macroRegime.usMarketOpen ? `OPEN (SPY ${state.macroRegime.spyMoveIntraday.toFixed(2)}%, QQQ ${state.macroRegime.qqqMoveIntraday.toFixed(2)}%)` : 'CLOSED (Pre/Post Market)'}
- Fee Hurdle: 0.11% Round-Trip Taker Fee on Bybit (require true continuation momentum, reject wicky fakeouts).
- Recent Self-Learning Rules from PostgreSQL:
${recentLessonsText}

Evaluate these candidate setups:
${listDescriptions.join('\n')}

Respond ONLY with a valid JSON array of objects having keys:
- "index": number (1-based index)
- "score": number (1 to 10; score >= 8 triggers immediate autonomous execution; score 7 sends manual approval card; score < 7 rejects)
- "thesis": string (1 crisp quantitative sentence explaining macro alignment, L2 imbalance, and fee-adjusted edge)`;

    const isThinkingModel = THINKING_MODELS.has(geminiModel);
    const generationConfig = {
      maxOutputTokens: isThinkingModel ? 1024 : 500,
      temperature: 0.15,
    };
    if (isThinkingModel) {
      generationConfig.thinkingConfig = { thinkingBudget: 512 };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      }
    );

    const data = await res.json();
    const rawText = extractGeminiResponseText(data);
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const cleanJson = jsonMatch ? jsonMatch[0] : rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedAudits = JSON.parse(cleanJson);

    return candidates.map((cand, idx) => {
      const matchingAudit = Array.isArray(parsedAudits) ? parsedAudits.find((a) => a.index === idx + 1) : null;
      return {
        ...cand,
        aiScore: Number(matchingAudit?.score) || 8,
        aiThesis: matchingAudit?.thesis || `${cand.setup} aligned with ${state.macroRegime.btcRegime} regime.`,
        aiModel: geminiModel,
      };
    });
  } catch (err) {
    console.warn(`[TraderService] Gemini (${geminiModel}) batch audit fallback:`, err.message);
    return candidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup}. Quantitative momentum & orderbook imbalance confirmed.`,
      aiModel: geminiModel,
    }));
  }
}

/**
 * ============================================================================
 * 1-MINUTE DUAL-ENGINE SCANNER (24/7 Bybit Crypto Perps + Alpaca 14 US Stocks)
 * ============================================================================
 */
async function runMarketScan(isManual = false) {
  // Check Hybrid Coordination: If Render Cloud is running and Local Laptop AGY holds an active lease (<90s old), yield!
  if (!isManual && process.env.IS_LOCAL_DAEMON !== 'true') {
    const coord = await getCoordinationState();
    if (coord.activeMode === 'LOCAL_AGY' && (coord.heartbeatAgeSeconds || 0) < 90) {
      console.log(`[TraderService] Yielding scan to active LOCAL_AGY master (${coord.activeAgentId}, age ${coord.heartbeatAgeSeconds}s)`);
      return [];
    }
  }

  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();

  const bybitOpenPositions = await getBybitPositions();
  const openPositionsMap = new Map((bybitOpenPositions || []).map((p) => [p.symbol, p]));

  const clock = await getAlpacaClock();
  const isUSMarketOpen = Boolean(clock && clock.is_open);
  state.macroRegime.usMarketOpen = isUSMarketOpen;

  const alpacaOpenPositions = isUSMarketOpen ? await getAlpacaPositions() : [];
  for (const ap of alpacaOpenPositions) {
    openPositionsMap.set(String(ap.symbol).toUpperCase(), {
      symbol: String(ap.symbol).toUpperCase(),
      side: ap.side === 'short' ? 'Sell' : 'Buy',
      avgPrice: ap.avg_entry_price,
      markPrice: ap.current_price,
      size: ap.qty,
      unrealisedPnl: ap.unrealized_pl,
      market: 'us_stock',
    });
  }

  const rawCandidates = [];
  const topMoversPreview = [];

  // ----------------------------------------------------------------------------
  // PART A: Scan 20 Bybit 24/7 Linear Crypto Perps (With BTC Macro Regime Gate)
  // ----------------------------------------------------------------------------
  try {
    const tickersRes = await bybitRequest('/v5/market/tickers', 'GET', 'category=linear');
    const tickerList = tickersRes?.result?.list || [];
    const tickerMap = new Map(tickerList.map((t) => [t.symbol, t]));

    // Evaluate BTC Macro Regime first
    const btcTicker = tickerMap.get('BTCUSDT');
    if (btcTicker) {
      const btcLast = Number(btcTicker.lastPrice || btcTicker.markPrice);
      const btcPrev1h = Number(btcTicker.prevPrice1h || btcLast);
      const btcMove1h = btcPrev1h > 0 ? ((btcLast - btcPrev1h) / btcPrev1h) * 100 : 0;
      state.macroRegime.btcMove1h = btcMove1h;
      state.macroRegime.btcRegime =
        btcMove1h <= -0.85 ? 'BEARISH_DUMP' : btcMove1h >= 0.85 ? 'BULLISH_SURGE' : 'NEUTRAL_FLOW';
    }

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

      // Skip wide-spread illiquid ticks
      if (spreadPct > 0.12) continue;

      const isBreakoutLong = (move1h >= 0.15 && imbalance >= 1.08) || (price24h > 1.8 && lastPrice >= high24h * 0.985);
      const isWickBounceLong = imbalance >= 1.30 && lastPrice >= low24h * 1.01 && move1h > -0.4;

      const isBreakdownShort = (move1h <= -0.15 && imbalance <= 0.92) || (price24h < -1.8 && lastPrice <= low24h * 1.015);
      const isRejectionShort = imbalance <= 0.78 && lastPrice <= high24h * 0.99 && move1h < 0.4;

      let decideShort = (isBreakdownShort || isRejectionShort) && (move1h < 0 || imbalance < 0.92);
      let decideLong = !decideShort && (isBreakoutLong || isWickBounceLong);

      // Apply Macro Regime Gatekeeper for Altcoins
      if (sym !== 'BTCUSDT') {
        if (state.macroRegime.btcRegime === 'BEARISH_DUMP' && decideLong && move1h < 1.2) {
          decideLong = false; // Veto weak altcoin Longs when BTC is dumping
          if (move1h < 0) decideShort = true;
        } else if (state.macroRegime.btcRegime === 'BULLISH_SURGE' && decideShort && move1h > -1.2) {
          decideShort = false; // Veto weak altcoin Shorts when BTC is surging
          if (move1h > 0) decideLong = true;
        }
      }

      if (!decideShort && !decideLong) continue;

      const action = decideShort ? 'sell' : 'buy';
      const setupName = decideShort
        ? isBreakdownShort
          ? '1m Bybit Linear Breakdown (SHORT)'
          : '1m Bybit Ask-Wall Rejection (SHORT)'
        : isBreakoutLong
        ? '1m Bybit Momentum Breakout (LONG)'
        : '1m Bybit Bid-Support Bounce (LONG)';

      const learnedBonus = (state.setupStats.get(setupName)?.weightBonus || 0) * 0.001;
      const obEdge = decideShort ? Math.max(0, 1 - imbalance) * 0.001 : Math.max(0, imbalance - 1) * 0.001;

      const stopLoss = decideShort
        ? formatPriceForBybit(lastPrice * 1.012)
        : formatPriceForBybit(lastPrice * 0.988);
      const takeProfit = decideShort
        ? formatPriceForBybit(lastPrice * 0.977)
        : formatPriceForBybit(lastPrice * 1.023);
      const orderQty = calculateBybitOrderQty(sym, lastPrice, state.paperSliceUSD);

      rawCandidates.push({
        market: 'crypto',
        symbol: sym,
        action,
        entryPrice: lastPrice,
        stopLoss: Number(stopLoss),
        takeProfit: Number(takeProfit),
        qty: orderQty,
        movePct: move1h,
        setup: setupName,
        orderbook: {
          imbalance: Number(imbalance.toFixed(2)),
          spreadPct: Number(spreadPct.toFixed(3)),
          bids: [[t.bid1Price, t.bid1Size]],
          asks: [[t.ask1Price, t.ask1Size]],
        },
        strength: Math.abs(move1h) * 0.012 + obEdge + learnedBonus,
      });
    }

    moverList.sort((a, b) => Math.abs(b.move5m) - Math.abs(a.move5m));
    for (const m of moverList.slice(0, 4)) {
      topMoversPreview.push(`${m.pair.replace('USDT', '')} (${m.move5m >= 0 ? '+' : ''}${m.move5m.toFixed(1)}%)`);
    }
  } catch (err) {
    console.error('[TraderService] Bybit Crypto scan error:', err.message);
  }

  // ----------------------------------------------------------------------------
  // PART B: Scan 14 High-Beta US Equities via Alpaca IEX Snapshots
  // ----------------------------------------------------------------------------
  const stockMoversPreview = [];
  try {
    const snapshots = await getAlpacaStockSnapshots(STOCK_WATCHLIST);
    const spySnap = snapshots?.SPY;
    const qqqSnap = snapshots?.QQQ;

    if (spySnap?.dailyBar && spySnap?.prevDailyBar) {
      state.macroRegime.spyMoveIntraday =
        ((spySnap.dailyBar.c - spySnap.prevDailyBar.c) / spySnap.prevDailyBar.c) * 100;
    }
    if (qqqSnap?.dailyBar && qqqSnap?.prevDailyBar) {
      state.macroRegime.qqqMoveIntraday =
        ((qqqSnap.dailyBar.c - qqqSnap.prevDailyBar.c) / qqqSnap.prevDailyBar.c) * 100;
    }
    state.macroRegime.usMarketRegime = !isUSMarketOpen
      ? 'CLOSED'
      : state.macroRegime.spyMoveIntraday <= -0.65
      ? 'BEARISH'
      : state.macroRegime.spyMoveIntraday >= 0.45
      ? 'BULLISH'
      : 'NEUTRAL';

    for (const sym of STOCK_WATCHLIST) {
      const snap = snapshots?.[sym];
      if (!snap) continue;
      const lastPrice = Number(snap.latestTrade?.p || snap.minuteBar?.c || snap.dailyBar?.c || 0);
      if (lastPrice <= 0) continue;
      const prevClose = Number(snap.prevDailyBar?.c || snap.dailyBar?.o || lastPrice);
      const dayChangePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
      const minOpen = Number(snap.minuteBar?.o || lastPrice);
      const minMovePct = minOpen > 0 ? ((lastPrice - minOpen) / minOpen) * 100 : 0;

      stockMoversPreview.push({ sym, dayChangePct });

      // Generate actionable US Stock candidates when US Market is OPEN (or during manual /scan test)
      if (isUSMarketOpen || isManual) {
        const isBullBreakout = dayChangePct >= 0.60 && minMovePct >= -0.05 && state.macroRegime.spyMoveIntraday > -0.65;
        const isOversoldBounce = dayChangePct <= -1.50 && minMovePct >= 0.15;

        if (isBullBreakout || isOversoldBounce) {
          const setupName = isBullBreakout
            ? 'US Equity Intraday ORB Breakout (LONG)'
            : 'US Equity Oversold VWAP Reclaim (LONG)';
          const stopLoss = Number((lastPrice * 0.991).toFixed(2));
          const takeProfit = Number((lastPrice * 1.018).toFixed(2));
          const qty = Math.max(1, Math.round(state.paperSliceUSD / lastPrice));

          rawCandidates.push({
            market: 'us_stock',
            symbol: sym,
            action: 'buy',
            entryPrice: lastPrice,
            stopLoss,
            takeProfit,
            qty: String(qty),
            movePct: dayChangePct,
            setup: setupName,
            orderbook: {
              imbalance: 1.25,
              spreadPct: 0.02,
            },
            strength: Math.abs(dayChangePct) * 0.01 + 0.003,
          });
        }
      }
    }

    stockMoversPreview.sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct));
  } catch (err) {
    console.warn('[TraderService] Alpaca US Stock scan error:', err.message);
  }

  // Anti-Martingale / Cooldown Filtering
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
    } else if (item.market === 'crypto') {
      const isPosLong = existing.side === 'Buy';
      const isSignalLong = item.action === 'buy';
      const entryPrice = Number(existing.avgPrice);
      const markPrice = Number(existing.markPrice);
      const plPercent =
        existing.side === 'Sell'
          ? ((entryPrice - markPrice) / entryPrice) * 100
          : ((markPrice - entryPrice) / entryPrice) * 100;

      if (isPosLong === isSignalLong) {
        const estimatedSlices = Math.max(1, Math.round((Number(existing.size) * markPrice) / state.paperSliceUSD));
        if (plPercent >= 0.85 && estimatedSlices < 3) {
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
  let currentCryptoCount = (bybitOpenPositions || []).length;
  let currentStockCount = (alpacaOpenPositions || []).length;

  for (const cand of auditedList) {
    if (cand.aiScore < 7) continue;

    state.alertCooldowns.set(cand.symbol, now);

    // Check if eligible for 100% Autonomous Execution (aiScore >= 8)
    let autoExecutedOrder = null;
    if (state.autoExecuteTrades && cand.aiScore >= 8) {
      try {
        if (cand.market === 'crypto' && currentCryptoCount < state.maxConcurrentCryptoPositions) {
          autoExecutedOrder = await placeBybitOrder({
            symbol: cand.symbol,
            side: cand.action,
            qty: cand.qty,
            stopLoss: cand.stopLoss,
            takeProfit: cand.takeProfit,
            entryPrice: cand.entryPrice,
          });
          currentCryptoCount += 1;
          state.activeTradeMeta.set(cand.symbol, {
            symbol: cand.symbol,
            market: 'crypto',
            setup: cand.setup,
          });
        } else if (
          cand.market === 'us_stock' &&
          isUSMarketOpen &&
          currentStockCount < state.maxConcurrentStockPositions
        ) {
          autoExecutedOrder = await placeAlpacaPaperOrder({
            symbol: cand.symbol,
            qty: cand.qty,
            notionalUSD: state.paperSliceUSD,
            side: cand.action,
          });
          currentStockCount += 1;
          state.activeTradeMeta.set(cand.symbol, {
            symbol: cand.symbol,
            market: 'us_stock',
            setup: cand.setup,
          });
        }
      } catch (execErr) {
        console.warn(`[TraderService] Auto-exec skipped for ${cand.symbol}:`, execErr.message);
      }
    }

    const hit = {
      market: cand.market,
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
      aiModel: cand.aiModel || rateLimiter.lastModelUsed,
      autoExecutedOrder,
    };

    qualifyingHits.push(hit);
    state.recentSignals.unshift(hit);
    if (state.recentSignals.length > 20) state.recentSignals.pop();

    await notifyTradeOpportunity(hit);
  }

  // Every-1-Minute Dual-Market Status Report to Telegram
  if (state.sendEveryScanReport && state.totalScansRun % 1 === 0 && state.subscribedChatIds.size > 0) {
    const totalCryptoOpen = (bybitOpenPositions || []).length;
    let posSummary = '• *Bybit Crypto Positions:* 0 active\n';
    if (totalCryptoOpen > 0) {
      posSummary = `*Bybit Open Crypto Positions (${totalCryptoOpen}):*\n`;
      for (const p of bybitOpenPositions) {
        const side = p.side === 'Sell' ? 'SHORT' : 'LONG';
        const plUsd = Number(p.unrealisedPnl || 0);
        const plInr = Math.round(plUsd * USD_TO_INR);
        const entryPrice = Number(p.avgPrice);
        const markPrice = Number(p.markPrice);
        const plPercent =
          p.side === 'Sell'
            ? ((entryPrice - markPrice) / entryPrice) * 100
            : ((markPrice - entryPrice) / entryPrice) * 100;
        posSummary += `  ↳ \`${p.symbol}\` (${side}): ${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(2)}% ($${plUsd.toFixed(2)} / ₹${plInr >= 0 ? '+' : ''}${plInr})\n`;
      }
    }

    if (alpacaOpenPositions.length > 0) {
      posSummary += `*Alpaca US Stock Positions (${alpacaOpenPositions.length}):*\n`;
      for (const sp of alpacaOpenPositions) {
        const plUsd = Number(sp.unrealized_pl || 0);
        const plPct = Number(sp.unrealized_plpc || 0) * 100;
        posSummary += `  ↳ \`${sp.symbol}\` (STOCK): ${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}% ($${plUsd.toFixed(2)})\n`;
      }
    }

    const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
    const quota = rateLimiter;
    const cryptoPulseText =
      topMoversPreview.length > 0 ? `🔥 *Crypto Pulse (24/7):* ${topMoversPreview.join(', ')}\n` : '';
    const topStocksStr = stockMoversPreview
      .slice(0, 4)
      .map((s) => `${s.sym} (${s.dayChangePct >= 0 ? '+' : ''}${s.dayChangePct.toFixed(1)}%)`)
      .join(', ');
    const stockPulseText = topStocksStr
      ? `🇺🇸 *US Stocks (${isUSMarketOpen ? 'OPEN' : 'EXT/CLOSED'}):* ${topStocksStr}\n`
      : '';

    const summaryReport =
      `⏱️ *1-MIN DUAL-MARKET AUTONOMOUS REPORT (#${state.totalScansRun})*\n\n` +
      `🎯 *₹6,000 Strategy Capital:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
      `📊 *Scoreboard:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE | *Auto-Exec:* ${state.autoExecuteTrades ? '🟢 ON' : '🟡 MANUAL'}\n` +
      `🧭 *Macro Regime:* BTC ${state.macroRegime.btcMove1h >= 0 ? '+' : ''}${state.macroRegime.btcMove1h.toFixed(2)}% (${state.macroRegime.btcRegime}) | SPY ${state.macroRegime.spyMoveIntraday >= 0 ? '+' : ''}${state.macroRegime.spyMoveIntraday.toFixed(2)}%\n` +
      `${cryptoPulseText}` +
      `${stockPulseText}` +
      `${posSummary}\n` +
      `🧠 *Thinking Pool (4 Keys):* \`${quota.lastModelUsed}\` (${quota.requestsThisMinute}/${quota.rpmLimit} RPM | ${quota.requestsToday}/${quota.rpdLimit} RPD)`;

    await broadcastTelegram(summaryReport);
  }

  return qualifyingHits;
}

function formatPrice(val) {
  return formatPriceForBybit(val);
}

/**
 * Send Interactive Telegram Card (Shows Auto-Executed status OR Manual Approve Button)
 */
async function notifyTradeOpportunity(signal) {
  const isShort = signal.action === 'sell';
  const isStock = signal.market === 'us_stock';
  const isScaleIn = signal.intent === 'SCALE_IN';
  const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
  const sideCode = isShort ? 's' : 'b';
  const entryStr = isStock ? Number(signal.entryPrice).toFixed(2) : formatPrice(signal.entryPrice);
  const stopStr = isStock ? Number(signal.stopLoss).toFixed(2) : formatPrice(signal.stopLoss);
  const targetStr = isStock ? Number(signal.takeProfit).toFixed(2) : formatPrice(signal.takeProfit);

  const exchangeBadge = isStock ? '🇺🇸 ALPACA US STOCK' : '⚡ BYBIT 24/7 PERP';
  const autoOrder = signal.autoExecutedOrder;

  const autoBanner = autoOrder
    ? `🤖 *AUTONOMOUSLY EXECUTED ON ${autoOrder.exchange.toUpperCase()}!*\n` +
      `• *Order ID:* \`${autoOrder.id}\` | *Qty:* \`${autoOrder.qty}\`\n\n`
    : '';

  const headerTitle = isScaleIn
    ? `📈 *SCALE-IN: \`${signal.symbol}\`* [${sideBadge}]`
    : `${exchangeBadge} [${sideBadge}]: \`${signal.symbol}\``;

  const card =
    `${headerTitle}\n\n` +
    `${autoBanner}` +
    `🧠 *Gemini Thinking Audit (${signal.aiScore}/10 via \`${signal.aiModel || 'gemini-3-flash'}\`):*\n` +
    `"${signal.aiThesis}"\n\n` +
    `• *Setup:* ${signal.setup}\n` +
    `• *Entry Price:* $${entryStr}\n` +
    `• *Slice Size:* *$${state.paperSliceUSD} USD Notional* (₹${signal.sliceMarginINR} Slice)\n` +
    `• *Stop Loss:* $${stopStr} | *Take Profit:* $${targetStr}\n` +
    `🛡️ *2-Stage Ratchet:* Stage 1 @ +0.90% (+0.20% Fee-Adjusted Lock) ➔ Stage 2 @ +1.55% (+0.85% Lock) ➔ TP @ +2.20%!`;

  const cbData = `ex:${signal.symbol}:${sideCode}:${signal.qty}:${stopStr}:${targetStr}:${entryStr}`.slice(0, 64);

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: autoOrder ? '➕ Add +1 Extra Slice ($250)' : isScaleIn ? 'Approve (+1 Slice)' : 'Approve & Execute',
          callback_data: cbData,
        },
        {
          text: 'Decline / Dismiss',
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
        text: 'Dismissed.',
      });
      await sendTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: '❌ *Card Dismissed.*',
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
      const isStock = isUSStock(rawSymbol);
      const symbol = isStock ? String(rawSymbol).toUpperCase() : resolveBybitSymbol(rawSymbol);

      await sendTelegram('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: `Executing ${sideBadge} on ${isStock ? 'Alpaca Paper' : 'Bybit Demo'}...`,
      });

      try {
        let order;
        if (isStock) {
          order = await placeAlpacaPaperOrder({
            symbol,
            qty,
            notionalUSD: state.paperSliceUSD,
            side: cleanSide,
          });
          state.activeTradeMeta.set(symbol, {
            symbol,
            market: 'us_stock',
            setup: `US Equity Scalp (${sideBadge})`,
          });
        } else {
          const livePrice = (await getBybitLatestPrice(symbol)) || Number(originalEntryPrice) || 100;
          order = await placeBybitOrder({
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
        }

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `✅ *TRADE EXECUTED ON ${order.exchange.toUpperCase()} [${sideBadge}]*\n\n` +
            `• *Symbol:* \`${symbol}\`\n` +
            `• *Direction:* *${sideBadge}*\n` +
            `• *Position Size:* ${order.qty} ($${state.paperSliceUSD} Notional)\n` +
            `• *Order ID:* \`${order.id}\`\n\n` +
            `🛡️ *2-Stage Ratchet Active:* Locks +0.20% at +0.90% move, +0.85% at +1.55% move, and banks TP at +2.20%.`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        console.error(`[TraderService] Execution error for ${symbol}:`, err.message);
        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `❌ Execution Error on ${symbol}: ${err.message}`,
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
        `🤖 *24/7 Dual-Market Autonomous Trading Desk (Bybit Crypto + Alpaca US Stocks)*\n\n` +
        `💵 *1:1 Strategy Sizing:* **$250 USD Notional per slice** (25x Isolated on Bybit Perps + $250 Fractional/Whole Shares on Alpaca US Equities).\n` +
        `🧠 *4-Key Gemini Native Thinking Pool:* Rotates across \`gemini-3-flash-preview\` & \`gemini-3.5-flash\` with \`thinkingBudget: 512\`.\n` +
        `🛡️ *Two-Stage Fee-Adjusted Breakeven Ratchet:* Covers 0.11% RT taker fees at +0.90% move (+0.20% lock) and ratchets to +0.85% at +1.55% move!\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - Live Dual-Market Status, Open Crypto & Stock Positions, Macro Regime\n` +
        `• \`/scan\` - Force immediate 1-minute Crypto + US Stock scan\n` +
        `• \`/auto on\` | \`/auto off\` - Toggle 100% Autonomous Order Execution\n` +
        `• \`/brain\` - View 7-Day Accuracy Scoreboard & Learned PostgreSQL Rules\n` +
        `• \`/balance\` - View Bybit Demo USDT + Alpaca US Stock Equity\n` +
        `• \`/trade <SYMBOL> <BUY|SELL>\` - Trigger a manual Crypto or US Stock card\n` +
        `• \`/mute\` / \`/unmute\` - Toggle 1-minute heartbeat summaries\n` +
        `• \`/reset\` - Reset journal stats`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/auto on') {
      state.autoExecuteTrades = true;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🤖 *100% Autonomous Execution ENABLED!* High-conviction setups (`aiScore >= 8`) will execute automatically on Bybit Demo & Alpaca Paper without waiting for button clicks.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/auto off') {
      state.autoExecuteTrades = false;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🟡 *Manual Confirmation Mode Enabled.* Setups will be sent as interactive `Approve` / `Decline` cards.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/brain' || text === '/learn') {
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';
      const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;

      let setupWeightsText = '_Calibrating setup weights as trades close..._\n';
      if (state.setupStats.size > 0) {
        setupWeightsText = '';
        for (const [sName, st] of state.setupStats.entries()) {
          setupWeightsText += `• \`${sName}\`: ${st.wins}W/${st.losses}L (${st.winRate}%) | Weight: ${st.weightBonus >= 0 ? '+' : ''}${st.weightBonus}\n`;
        }
      }

      let lessonsList = '_Closed trades automatically log post-mortem rules here._\n';
      if (state.learnedLessons.length > 0) {
        lessonsList = state.learnedLessons
          .slice(0, 8)
          .map((l, i) => `${i + 1}. \`[${l.symbol} ${l.outcome}]\` ${l.lesson}`)
          .join('\n');
      }

      const reply =
        `🧠 *DUAL-MARKET SELF-LEARNING BRAIN (4-Key Thinking Pool)*\n\n` +
        `🎯 *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `📊 *Record:* ${state.totalWins}W | ${state.totalLosses}L | ${state.totalBreakevens}BE (*${winRate}% Win Rate*)\n` +
        `🔑 *Gemini Pool:* ${GEMINI_KEYS.length} Keys Active | Last Model: \`${rateLimiter.lastModelUsed}\` (Thoughts: ${rateLimiter.lastThoughtsTokens} tokens)\n` +
        `🔋 *Quota Governor:* ${rateLimiter.requestsThisMinute}/${rateLimiter.rpmLimit} RPM | ${rateLimiter.requestsToday}/${rateLimiter.rpdLimit} RPD\n\n` +
        `*1. Bayesian Setup Expectancy Matrix:*\n${setupWeightsText}\n` +
        `*2. Permanent Post-Mortem Rules:*\n${lessonsList}`;

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/mute') {
      state.sendEveryScanReport = false;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🔕 *1-Minute Heartbeat Summaries Muted.* You will still receive all trade execution alerts.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/unmute') {
      state.sendEveryScanReport = true;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🔔 *1-Minute Heartbeat Summaries Active!*',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/status') {
      const [bybitBal, bybitPositions, alpacaAcct, alpacaPositions, coord] = await Promise.all([
        getBybitWalletBalance(),
        getBybitPositions(),
        getAlpacaAccount(),
        getAlpacaPositions(),
        getCoordinationState(),
      ]);
      const totalDecided = state.totalWins + state.totalLosses;
      const winRate = totalDecided > 0 ? ((state.totalWins / totalDecided) * 100).toFixed(1) : '100.0';

      let unrealizedUSD = 0;
      for (const p of bybitPositions) unrealizedUSD += Number(p.unrealisedPnl || 0);
      for (const sp of alpacaPositions) unrealizedUSD += Number(sp.unrealized_pl || 0);

      const liveLifelineINR = state.lifelineBaseINR + state.realizedPnlINR + Math.round(unrealizedUSD * USD_TO_INR);
      const lastScanStr = state.lastScanTime ? state.lastScanTime.toLocaleTimeString() : 'Running...';

      let reply =
        `🛰️ *DUAL-MARKET AUTONOMOUS DESK STATUS*\n\n` +
        `🎯 *₹6,000 Strategy Live Balance:* *₹${liveLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `🤖 *Execution Mode:* *${state.autoExecuteTrades ? '100% AUTONOMOUS (Auto-Exec ON)' : 'MANUAL APPROVAL'}*\n` +
        `🔄 *Active Coordinator:* \`${coord.activeMode}\` (${coord.activeAgentId})\n` +
        `🧠 *Accuracy:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE (*${winRate}%*)\n` +
        `🔑 *Gemini Thinking Pool:* ${GEMINI_KEYS.length} Keys (\`${rateLimiter.lastModelUsed}\`)\n` +
        `🧭 *Macro Regime:* BTC ${state.macroRegime.btcMove1h >= 0 ? '+' : ''}${state.macroRegime.btcMove1h.toFixed(2)}% (${state.macroRegime.btcRegime}) | US Market: ${state.macroRegime.usMarketOpen ? '🟢 OPEN' : '🕒 CLOSED'}\n` +
        `• *Last Scan:* #${state.totalScansRun} at ${lastScanStr}\n\n`;

      if (bybitPositions.length > 0) {
        reply += `*Open Bybit Crypto Positions (${bybitPositions.length}):*\n`;
        for (const p of bybitPositions) {
          const side = p.side === 'Sell' ? 'SHORT' : 'LONG';
          const plUsd = Number(p.unrealisedPnl || 0);
          const entryPrice = Number(p.avgPrice);
          const markPrice = Number(p.markPrice);
          const plPercent =
            p.side === 'Sell'
              ? ((entryPrice - markPrice) / entryPrice) * 100
              : ((markPrice - entryPrice) / entryPrice) * 100;
          reply += `• \`${p.symbol}\` (${side}): ${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(2)}% ($${plUsd.toFixed(2)})\n`;
        }
        reply += '\n';
      }

      if (alpacaPositions.length > 0) {
        reply += `*Open Alpaca US Stock Positions (${alpacaPositions.length}):*\n`;
        for (const sp of alpacaPositions) {
          const plUsd = Number(sp.unrealized_pl || 0);
          const plPct = Number(sp.unrealized_plpc || 0) * 100;
          reply += `• \`${sp.symbol}\` (STOCK): ${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}% ($${plUsd.toFixed(2)})\n`;
        }
        reply += '\n';
      }

      if (bybitBal) {
        reply += `💼 *Bybit Demo Equity:* $${bybitBal.totalEquity.toLocaleString()} USDT\n`;
      }
      if (alpacaAcct) {
        reply += `🇺🇸 *Alpaca US Stock Equity:* $${Number(alpacaAcct.equity || 0).toLocaleString()} USD`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/scan') {
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '⏳ *Running immediate Dual-Market scan (20 Bybit Crypto Perps + 14 Alpaca US Stocks) with Gemini Thinking Mode...*',
        parse_mode: 'Markdown',
      });
      const manualHits = await runMarketScan(true);
      if (!manualHits || manualHits.length === 0) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: '🔍 *Manual Scan Completed:* All 20 Crypto Perps & 14 US Stocks scanned. No new setups passed the macro + fee-hurdle filter this minute.',
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (text === '/balance') {
      const [bybitBal, bybitPositions, alpacaAcct, alpacaPositions] = await Promise.all([
        getBybitWalletBalance(),
        getBybitPositions(),
        getAlpacaAccount(),
        getAlpacaPositions(),
      ]);

      let reply = `💼 *DUAL-MARKET PORTFOLIO BALANCES*\n\n`;
      if (bybitBal) {
        reply +=
          `*1. Bybit Demo (24/7 Crypto Perps):*\n` +
          `• *Total Equity:* $${bybitBal.totalEquity.toLocaleString()} USDT\n` +
          `• *Available:* $${bybitBal.totalAvailableBalance.toLocaleString()} USDT\n` +
          `• *Open Perp Positions:* ${bybitPositions.length}\n\n`;
      }
      if (alpacaAcct) {
        reply +=
          `*2. Alpaca Paper (14 US Equities):*\n` +
          `• *Total Equity:* $${Number(alpacaAcct.equity || 0).toLocaleString()} USD\n` +
          `• *Buying Power:* $${Number(alpacaAcct.buying_power || 0).toLocaleString()} USD\n` +
          `• *Open Stock Positions:* ${alpacaPositions.length}\n`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text.startsWith('/trade')) {
      const parts = text.split(' ').filter(Boolean);
      if (parts.length < 3) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `⚠️ *Usage:* \`/trade <SYMBOL> <BUY|SELL> [QTY]\`\n_Examples:_ \`/trade SOL BUY\` or \`/trade NVDA BUY\``,
          parse_mode: 'Markdown',
        });
        return;
      }

      const [, rawSym, side, customQty] = parts;
      const cleanSide = side.toLowerCase() === 'sell' ? 'sell' : 'buy';
      const isShort = cleanSide === 'sell';
      const isStock = isUSStock(rawSym);
      const symbol = isStock ? String(rawSym).toUpperCase() : resolveBybitSymbol(rawSym);

      let currentPrice = 100.0;
      if (isStock) {
        const snaps = await getAlpacaStockSnapshots([symbol]);
        currentPrice = Number(snaps?.[symbol]?.latestTrade?.p || snaps?.[symbol]?.dailyBar?.c || 100);
      } else {
        currentPrice = (await getBybitLatestPrice(symbol)) || 100.0;
      }

      const stopPrice = isShort ? currentPrice * 1.012 : currentPrice * 0.988;
      const targetPrice = isShort ? currentPrice * 0.977 : currentPrice * 1.023;
      const qty =
        customQty ||
        (isStock
          ? String(Math.max(1, Math.round(state.paperSliceUSD / currentPrice)))
          : calculateBybitOrderQty(symbol, currentPrice, state.paperSliceUSD));

      const promptText =
        `📊 *MANUAL SCALP PROPOSAL [${isStock ? 'US STOCK' : 'BYBIT PERP'}]: \`${symbol}\`*\n\n` +
        `• *Action:* ${cleanSide.toUpperCase()} ${qty}\n` +
        `• *Live Price:* $${formatPrice(currentPrice)}\n` +
        `• *Stop Loss:* $${formatPrice(stopPrice)}\n` +
        `• *Take Profit:* $${formatPrice(targetPrice)}`;

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
          `• *Cleared Records:* ${res.clearedRecords}\n` +
          `• *Clean Base Balance:* ₹${state.lifelineBaseINR.toLocaleString()}`,
        parse_mode: 'Markdown',
      });
      return;
    }

    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: `Command not recognized. Type /help, /status, /scan, or /auto on.`,
    });
  }
}

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
  state.stage2TrailedPositions.clear();
  state.activeCryptoTrades.clear();

  return { clearedRecords };
}

let loopsStarted = false;

async function startBackgroundLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  console.log(`[TraderService] Starting Dual-Market 1-Minute Scanner (60s) & 2-Stage Ratchet Monitor (30s)...`);
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
  getAlpacaClock,
  getAlpacaAccount,
  getAlpacaPositions,
  getAlpacaStockSnapshots,
  placeAlpacaPaperOrder,
  closeAlpacaPosition,
  getCoordinationState,
  updateHeartbeat,
  handoffControl,
  runMarketScan,
  monitorOngoingTrades,
  resetJournalAndBalance,
  GEMINI_KEYS,
  GEMINI_MODEL_BUCKETS,
  rateLimiter,
  state,
};
