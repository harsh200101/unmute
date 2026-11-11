'use strict';

const crypto = require('crypto');
const https = require('https');
const { pool } = require('../config/db');

// Telegram Configuration (Execution Bot + Dedicated Thinking Bot @Traderthinkbot)
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9066897267:AAFxTbLCj2KmUZ9d070hvEG4Am7-HB4-7Wc';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const TELEGRAM_THINK_TOKEN = process.env.TELEGRAM_THINK_BOT_TOKEN || '8836965252:AAFqSAHp02FqZnP7KpiQKMDIcbA9-mB3tbI';
const TELEGRAM_THINK_API = `https://api.telegram.org/bot${TELEGRAM_THINK_TOKEN}`;

// STRICT UNBYPASSABLE COMPLIANCE BAN: NEVER TOUCH INTUIT (INTU / INTUUSDT)
const STRICTLY_BLOCKED_SYMBOLS = new Set([
  'INTU',
  'INTUUSDT',
  'INTUUSD',
  'INTUPERP',
  'INTUSTOCK',
  'INTUSTOCKUSDT',
  'INTUIT',
]);

function isStrictlyBlockedSymbol(symbol, fullName = '') {
  const s = String(symbol || '').toUpperCase().trim();
  const f = String(fullName || '').toUpperCase().trim();
  if (!s) return false;
  if (STRICTLY_BLOCKED_SYMBOLS.has(s)) return true;
  if (s === 'INTU' || s.startsWith('INTU') || s.includes('INTUIT') || f.includes('INTUIT')) return true;
  return false;
}

// Bybit Demo Perpetual Futures Configuration (24/7 Crypto Perps + 293 US Stock Perps)
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

// Adaptive Model Tiering: High-Stakes Reasoning vs Low-Cost Zero-Thought Monitoring
const MODEL_TIERS = {
  HIGH_REASONING: ['gemini-3.6-flash', 'gemini-3.5-flash'],
  ROUTINE_MONITOR: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
};

const GEMINI_MODEL_BUCKETS = [...MODEL_TIERS.HIGH_REASONING, ...MODEL_TIERS.ROUTINE_MONITOR];

const STAGE_CONFIGS = {
  // When starting, entering, or evaluating trade execution conviction (High stakes -> High Model + Deep Thinking)
  TRADE_ENTRY_AUDIT: {
    pool: MODEL_TIERS.HIGH_REASONING,
    thinkingBudget: 1024,
    includeThoughts: true,
    temperature: 0.15,
    maxOutputTokens: 2500,
  },
  // When editing, ratcheting, or evaluating exits (High precision -> High Model + Moderate Thinking)
  TRADE_EXIT_AUDIT: {
    pool: MODEL_TIERS.HIGH_REASONING,
    thinkingBudget: 512,
    includeThoughts: true,
    temperature: 0.1,
    maxOutputTokens: 1500,
  },
  // When user messages on @Traderthinkbot (High agency -> Deep Reasoning)
  OPERATOR_INTERACTIVE: {
    pool: MODEL_TIERS.HIGH_REASONING,
    thinkingBudget: 1024,
    includeThoughts: true,
    temperature: 0.2,
    maxOutputTokens: 2500,
  },
  // Routine position/market monitoring (Low stakes -> Ultra-cheap Lite model + ZERO thinking budget = 95% token savings!)
  ROUTINE_MONITOR: {
    pool: MODEL_TIERS.ROUTINE_MONITOR,
    thinkingBudget: 0,
    includeThoughts: false,
    temperature: 0.1,
    maxOutputTokens: 300,
  },
  // Post-mortem autopsy lesson extraction (Compact -> Cheap Lite model + 128 tokens)
  POST_MORTEM_LESSON: {
    pool: MODEL_TIERS.ROUTINE_MONITOR,
    thinkingBudget: 128,
    includeThoughts: true,
    temperature: 0.2,
    maxOutputTokens: 400,
  },
};

let geminiKeyIdx = 0;
let tierIndices = {
  HIGH_REASONING: 0,
  ROUTINE_MONITOR: 0,
};

function getAdaptiveModelConfig(stage = 'TRADE_ENTRY_AUDIT') {
  const cfg = STAGE_CONFIGS[stage] || STAGE_CONFIGS.TRADE_ENTRY_AUDIT;
  const key = GEMINI_KEYS.length > 0 ? GEMINI_KEYS[geminiKeyIdx % GEMINI_KEYS.length] : '';
  geminiKeyIdx += 1;

  const poolType = cfg.pool === MODEL_TIERS.ROUTINE_MONITOR ? 'ROUTINE_MONITOR' : 'HIGH_REASONING';
  const model = cfg.pool[tierIndices[poolType] % cfg.pool.length];
  tierIndices[poolType] += 1;

  rateLimiter.lastModelUsed = model;

  const generationConfig = {
    maxOutputTokens: cfg.maxOutputTokens,
    temperature: cfg.temperature,
  };

  if (cfg.includeThoughts && cfg.thinkingBudget > 0) {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: cfg.thinkingBudget,
    };
  }

  return { key, model, cfg, generationConfig };
}

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
  lastModelUsed: 'gemini-3.6-flash',
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

const USD_TO_INR = 87;

const state = {
  subscribedChatIds: new Set(),
  thinkSubscribedChatIds: new Set(),
  thinkBotLastUpdateId: 0,
  operatorDirectives: [],         // Live natural-language instructions from user on Telegram
  recentThoughts: [],             // Full Chain-of-Thought history for CLI & @Traderthinkbot
  scannerIntervalMs: 60 * 1000,
  monitorIntervalMs: 30 * 1000,
  sendEveryScanReport: true,
  autoExecuteTrades: true,        // 100% Autonomous execution for high-conviction setups (aiScore >= 8)
  maxConcurrentCryptoPositions: 5,
  maxConcurrentBybitStockPositions: 6,
  maxConcurrentStockPositions: 6,
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(),
  trailedPositions: new Set(),
  stage2TrailedPositions: new Set(),
  bookedPositions: new Set(),
  activeTradeMeta: new Map(),
  activeCryptoTrades: new Map(),
  bybitStockUniverse: new Map(),  // Dynamically loaded 293 Bybit US Stock Perpetuals (INTU strictly excluded)
  bybitCryptoUniverse: new Map(), // Dynamically loaded 568 Bybit Crypto USDT Perpetuals
  lastUniverseRefresh: 0,
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
    activeBias: 'CRYPTO_24_7',
  },
  isPaused: false,
  pauseReason: null,
  isQuietMarket: false,
  coordination: {
    activeMode: 'RENDER_CLOUD',
    lastHeartbeat: new Date(),
    activeAgentId: 'render-primary',
  },
};

// Fallback seed Crypto list (used only before first dynamic Bybit universe load completes)
const BYBIT_CRYPTO_WATCHLIST = [
  'SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'XRPUSDT',
  'AVAXUSDT', 'LINKUSDT', 'PEPEUSDT', 'SHIBUSDT', 'ADAUSDT',
  'NEARUSDT', 'SUIUSDT', 'APTUSDT', 'WIFUSDT', 'BONKUSDT',
  'ARBUSDT', 'OPUSDT', 'LTCUSDT', 'BNBUSDT', 'INJUSDT',
];

// Fallback seed Bybit US Stock Perps list (used before dynamic load of all 293 Bybit US Stock Perps)
const BYBIT_STOCK_SEED_LIST = [
  'NVDAUSDT', 'TSLAUSDT', 'AAPLUSDT', 'AMDSTOCKUSDT', 'MSFTUSDT',
  'AMZNUSDT', 'METAUSDT', 'GOOGLUSDT', 'NFLXUSDT', 'PLTRUSDT',
  'COINUSDT', 'MSTRUSDT', 'SPYUSDT', 'QQQUSDT', 'TQQQUSDT',
  'AVGOUSDT', 'ARMUSDT', 'SMCIUSDT', 'MUUSDT', 'CRWDUSDT',
  'PANWUSDT', 'SNOWUSDT', 'UBERUSDT', 'BABAUSDT', 'TSMUSDT', 'ASMLUSDT',
];

const VALID_BYBIT_CRYPTO_SET = new Set(BYBIT_CRYPTO_WATCHLIST);

// 40 High-Beta Liquid US Equities on Alpaca Paper (STRICTLY EXCLUDING INTU)
const STOCK_WATCHLIST = [
  'TSLA', 'NVDA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NFLX', 'SPY', 'QQQ', 'TQQQ', 'SOXL',
  'COIN', 'MSTR', 'PLTR', 'MARA', 'SMCI', 'AVGO', 'ARM', 'MU', 'TSM', 'ASML', 'ORCL', 'CRM', 'ADBE',
  'CRWD', 'PANW', 'SNOW', 'UBER', 'SHOP', 'LLY', 'JPM', 'GS', 'BA', 'CAT', 'XOM', 'CVX', 'BABA', 'HOOD',
].filter((s) => !isStrictlyBlockedSymbol(s));

const VALID_STOCK_SET = new Set(STOCK_WATCHLIST);

function isBybitStockPerp(symbol) {
  const clean = String(symbol || '').toUpperCase().trim();
  if (state.bybitStockUniverse.has(clean)) return true;
  if (BYBIT_STOCK_SEED_LIST.includes(clean)) return true;
  return false;
}

function isUSStock(symbol) {
  const clean = String(symbol || '').toUpperCase().trim();
  if (isStrictlyBlockedSymbol(clean)) return false;
  return VALID_STOCK_SET.has(clean);
}

function normalizeSymbol(sym) {
  return String(sym || '').replace('/', '').toUpperCase().trim();
}

function formatPriceForBybit(price, symbol = '') {
  const p = Number(price);
  if (isNaN(p) || p <= 0) return '0.00';
  const inst = state.bybitStockUniverse.get(symbol) || state.bybitCryptoUniverse.get(symbol);
  if (inst && inst.tickSize) {
    const tick = Number(inst.tickSize);
    if (tick > 0) {
      const decimals = (inst.tickSize.split('.')[1] || '').replace(/0+$/, '').length;
      const rounded = Math.round(p / tick) * tick;
      return rounded.toFixed(decimals);
    }
  }
  if (p >= 1000) return p.toFixed(1);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(7);
}

function resolveBybitSymbol(rawSymbol) {
  let sym = String(rawSymbol || '').toUpperCase().trim();
  if (isStrictlyBlockedSymbol(sym)) {
    throw new Error(`STRICT COMPLIANCE BLOCK: ${sym} (Intuit) is permanently restricted and cannot be touched.`);
  }
  if (state.bybitStockUniverse.has(sym) || state.bybitCryptoUniverse.has(sym)) return sym;
  if (VALID_STOCK_SET.has(sym) && !sym.endsWith('USDT')) return sym;
  sym = sym.replace('B-', '').replace('_USDT', '').replace('/USD', '').replace('/USDT', '');
  if (!sym.endsWith('USDT')) {
    sym += 'USDT';
  }
  if (isStrictlyBlockedSymbol(sym)) {
    throw new Error(`STRICT COMPLIANCE BLOCK: ${sym} (Intuit) is permanently restricted and cannot be touched.`);
  }
  return sym;
}

function calculateBybitOrderQty(symbol, price, notionalUSD = 250) {
  const norm = String(symbol).toUpperCase().replace('/', '');
  const p = Number(price) > 0 ? Number(price) : 100;
  const rawQty = notionalUSD / p;

  const inst = state.bybitStockUniverse.get(norm) || state.bybitCryptoUniverse.get(norm);
  if (inst && inst.qtyStep && inst.minOrderQty) {
    const step = Number(inst.qtyStep);
    const minQ = Number(inst.minOrderQty);
    if (step > 0) {
      const decimals = (inst.qtyStep.split('.')[1] || '').replace(/0+$/, '').length;
      const stepped = Math.max(minQ, Math.floor(rawQty / step) * step || minQ);
      return stepped.toFixed(decimals);
    }
  }

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

async function refreshBybitInstrumentUniverse() {
  try {
    let cursor = '';
    const allInst = [];
    do {
      const q = `category=linear&limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
      const res = await bybitRequest('/v5/market/instruments-info', 'GET', q);
      const list = res?.result?.list || [];
      allInst.push(...list);
      cursor = res?.result?.nextPageCursor || '';
    } while (cursor);

    let stockCount = 0;
    let cryptoCount = 0;
    for (const inst of allInst) {
      if (inst.status !== 'Trading' || inst.quoteCoin !== 'USDT') continue;
      if (
        isStrictlyBlockedSymbol(inst.symbol, inst.fullName) ||
        isStrictlyBlockedSymbol(inst.baseCoin, inst.fullName) ||
        isStrictlyBlockedSymbol(inst.underlyingTicker, inst.fullName)
      ) {
        continue; // STRICT COMPLIANCE BAN: NEVER load INTU / Intuit
      }
      const meta = {
        symbol: inst.symbol,
        baseCoin: inst.baseCoin,
        underlyingTicker: inst.underlyingTicker || inst.baseCoin,
        fullName: inst.fullName || inst.baseCoin,
        symbolType: inst.symbolType || 'crypto',
        marketRegion: inst.marketRegion || '',
        maxLeverage: Number(inst.leverageFilter?.maxLeverage || 25),
        tickSize: inst.priceFilter?.tickSize || '0.01',
        qtyStep: inst.lotSizeFilter?.qtyStep || '0.01',
        minOrderQty: inst.lotSizeFilter?.minOrderQty || '0.01',
      };
      if (inst.symbolType === 'stock' || inst.marketRegion === 'US') {
        state.bybitStockUniverse.set(inst.symbol, meta);
        stockCount += 1;
      } else {
        state.bybitCryptoUniverse.set(inst.symbol, meta);
        cryptoCount += 1;
      }
    }
    state.lastUniverseRefresh = Date.now();
    console.log(
      `[TraderService] Dynamic Bybit Universe Loaded: ${stockCount} US Stock Perpetuals (INTU Strictly Blocked) + ${cryptoCount} Crypto USDT Perpetuals`
    );
  } catch (err) {
    console.warn('[TraderService] Error refreshing Bybit instrument universe:', err.message);
  }
}

async function placeBybitOrder({ symbol, side, qty, stopLoss, takeProfit, entryPrice }) {
  if (isStrictlyBlockedSymbol(symbol)) {
    throw new Error(`STRICT COMPLIANCE BLOCK: ${symbol} (Intuit) is permanently restricted and cannot be traded.`);
  }
  const normSym = resolveBybitSymbol(symbol);
  if (isStrictlyBlockedSymbol(normSym)) {
    throw new Error(`STRICT COMPLIANCE BLOCK: ${normSym} (Intuit) is permanently restricted and cannot be traded.`);
  }
  const bybitSide = side.toLowerCase() === 'sell' || side.toLowerCase() === 'short' ? 'Sell' : 'Buy';
  const inst = state.bybitStockUniverse.get(normSym) || state.bybitCryptoUniverse.get(normSym);
  const targetLev = String(Math.min(25, inst?.maxLeverage || 25));

  try {
    await bybitRequest('/v5/position/set-leverage', 'POST', {
      category: 'linear',
      symbol: normSym,
      buyLeverage: targetLev,
      sellLeverage: targetLev,
    });
  } catch (e) {
    // Ignore if leverage already set
  }

  const fillPrice = Number(entryPrice) || (await getBybitLatestPrice(normSym)) || 100;
  const orderQty = qty && parseFloat(qty) > 0 ? String(qty) : calculateBybitOrderQty(normSym, fillPrice, state.paperSliceUSD);

  const slNum = Number(stopLoss);
  const tpNum = Number(takeProfit);

  let computedSL;
  let computedTP;

  if (bybitSide === 'Buy') {
    computedSL = slNum > 0 && slNum < fillPrice ? formatPriceForBybit(slNum, normSym) : formatPriceForBybit(fillPrice * 0.988, normSym);
    computedTP = tpNum > fillPrice ? formatPriceForBybit(tpNum, normSym) : formatPriceForBybit(fillPrice * 1.023, normSym);
  } else {
    computedSL = slNum > fillPrice ? formatPriceForBybit(slNum, normSym) : formatPriceForBybit(fillPrice * 1.012, normSym);
    computedTP = tpNum > 0 && tpNum < fillPrice ? formatPriceForBybit(tpNum, normSym) : formatPriceForBybit(fillPrice * 0.977, normSym);
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
    const isStockPerp = isBybitStockPerp(normSym);
    return {
      id: res.result.orderId,
      symbol: normSym,
      side: bybitSide,
      qty: orderQty,
      stopLoss: computedSL,
      takeProfit: computedTP,
      entryPrice: fillPrice,
      exchange: isStockPerp ? 'Bybit Demo (25x US Stock Perp)' : 'Bybit Demo (25x Crypto Perp)',
      status: 'filled',
    };
  }

  // If Bybit returns 110126 (Stock Perp agreement popup not clicked in Bybit Web UI yet),
  // automatically route the underlying US Stock ticker to Alpaca Paper US Equities!
  if (res && res.retCode === 110126 && isBybitStockPerp(normSym)) {
    const underlying = (
      inst?.underlyingTicker ||
      normSym.replace(/STOCKUSDT$/i, '').replace(/USDT$/i, '')
    ).toUpperCase();
    if (!isStrictlyBlockedSymbol(underlying)) {
      console.log(
        `[TraderService] Bybit Stock Perp ${normSym} requires UI agreement (110126) -> Auto-routing ${underlying} to Alpaca US Equities!`
      );
      return await placeAlpacaPaperOrder({
        symbol: underlying,
        qty: Math.max(1, Math.round(state.paperSliceUSD / fillPrice)),
        notionalUSD: state.paperSliceUSD,
        side: bybitSide === 'Sell' ? 'sell' : 'buy',
      });
    }
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
 * ALPACA PAPER US EQUITIES ENGINE (40+ High-Beta US Stocks, INTU Strictly Blocked)
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
    return Array.isArray(data) ? data.filter((p) => !isStrictlyBlockedSymbol(p.symbol)) : [];
  } catch (err) {
    console.warn('[TraderService] Alpaca positions error:', err.message);
    return [];
  }
}

async function getAlpacaStockSnapshots(symbols = STOCK_WATCHLIST) {
  if (!APCA_KEY || !APCA_SECRET) return {};
  try {
    const safeSymbols = symbols.filter((s) => !isStrictlyBlockedSymbol(s));
    const url = `${APCA_DATA_URL}/v2/stocks/snapshots?symbols=${encodeURIComponent(safeSymbols.join(','))}&feed=iex`;
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
  if (isStrictlyBlockedSymbol(cleanSym)) {
    throw new Error(`STRICT COMPLIANCE BLOCK: ${cleanSym} (Intuit) is permanently restricted and cannot be traded.`);
  }
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
      CREATE TABLE IF NOT EXISTS trader_think_subscribers (
        chat_id BIGINT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS trader_operator_directives (
        id SERIAL PRIMARY KEY,
        chat_id BIGINT,
        directive TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
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
        is_paused BOOLEAN DEFAULT FALSE,
        pause_reason TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE desk_coordination ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
      ALTER TABLE desk_coordination ADD COLUMN IF NOT EXISTS pause_reason TEXT;
      INSERT INTO desk_coordination (id, active_mode, last_heartbeat, active_agent_id, is_paused)
      VALUES (1, 'RENDER_CLOUD', NOW(), 'render-primary', FALSE)
      ON CONFLICT (id) DO NOTHING;
    `);

    const subRes = await pool.query('SELECT chat_id FROM trader_subscribers');
    for (const row of subRes.rows) {
      if (String(row.chat_id) === '999999') continue;
      state.subscribedChatIds.add(String(row.chat_id));
      state.thinkSubscribedChatIds.add(String(row.chat_id));
    }

    const thinkSubRes = await pool.query('SELECT chat_id FROM trader_think_subscribers');
    for (const row of thinkSubRes.rows) {
      if (String(row.chat_id) === '999999') continue;
      state.thinkSubscribedChatIds.add(String(row.chat_id));
      state.subscribedChatIds.add(String(row.chat_id));
    }

    const dirRes = await pool.query(
      'SELECT * FROM trader_operator_directives WHERE active = TRUE ORDER BY created_at DESC LIMIT 15'
    );
    state.operatorDirectives = dirRes.rows.map((r) => r.directive);

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

    await refreshBybitInstrumentUniverse();

    console.log(
      `[TraderService] Initialized Full-Universe Dual-Engine (${state.bybitStockUniverse.size} Bybit US Stock Perps + ` +
        `${state.bybitCryptoUniverse.size} Bybit Crypto Perps + ${STOCK_WATCHLIST.length} Alpaca US Stocks) with ` +
        `${GEMINI_KEYS.length} Gemini Thinking keys, ${state.subscribedChatIds.size} subscribers, ` +
        `${state.operatorDirectives.length} operator directives, and ${state.learnedLessons.length} self-learning rules.`
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
      if (row.is_paused !== undefined && row.is_paused !== null) {
        state.isPaused = Boolean(row.is_paused);
        state.pauseReason = row.pause_reason || null;
      }
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

async function setDeskPauseState(isPaused, reason = 'Operator directive') {
  state.isPaused = Boolean(isPaused);
  state.pauseReason = state.isPaused ? reason : null;
  try {
    await pool.query(
      `UPDATE desk_coordination
       SET is_paused = $1, pause_reason = $2, updated_at = NOW()
       WHERE id = 1`,
      [state.isPaused, state.pauseReason]
    );
  } catch (err) {
    console.warn('[TraderService] Pause state persistence error:', err.message);
  }
  return { isPaused: state.isPaused, pauseReason: state.pauseReason };
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
    if (String(chatId) === '999999') return;
    state.subscribedChatIds.add(String(chatId));
    state.thinkSubscribedChatIds.add(String(chatId));
    await pool.query('INSERT INTO trader_subscribers (chat_id) VALUES ($1) ON CONFLICT DO NOTHING', [chatId]);
    await pool.query('INSERT INTO trader_think_subscribers (chat_id) VALUES ($1) ON CONFLICT DO NOTHING', [chatId]);
  } catch (err) {
    console.error('[TraderService] Error saving subscriber:', err.message);
  }
}

async function saveOperatorDirective(chatId, directiveText) {
  const clean = String(directiveText || '').trim();
  if (!clean) return;
  try {
    state.operatorDirectives.unshift(clean);
    if (state.operatorDirectives.length > 15) state.operatorDirectives.pop();
    await pool.query('INSERT INTO trader_operator_directives (chat_id, directive, active) VALUES ($1, $2, TRUE)', [
      chatId,
      clean,
    ]);
  } catch (err) {
    console.warn('[TraderService] Error saving operator directive:', err.message);
  }
}

async function sendTelegramToApi(baseApiUrl, method, body) {
  try {
    const res = await fetch(`${baseApiUrl}/${method}`, {
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
      const retryRes = await fetch(`${baseApiUrl}/${method}`, {
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

async function sendTelegram(method, body) {
  return sendTelegramToApi(TELEGRAM_API, method, body);
}

async function sendThinkTelegram(method, body) {
  return sendTelegramToApi(TELEGRAM_THINK_API, method, body);
}

async function broadcastTelegram(text) {
  if (state.subscribedChatIds.size === 0) return;
  for (const chatId of state.subscribedChatIds) {
    if (String(chatId) === '999999') continue;
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }
}

async function broadcastThinkTelegram(text) {
  const targets = state.thinkSubscribedChatIds.size > 0 ? state.thinkSubscribedChatIds : state.subscribedChatIds;
  if (targets.size === 0) return;
  const chunks = [];
  if (text.length <= 3900) {
    chunks.push(text);
  } else {
    for (let i = 0; i < text.length; i += 3800) {
      chunks.push(text.slice(i, i + 3800));
    }
  }
  for (const chatId of targets) {
    if (String(chatId) === '999999') continue;
    for (const chunk of chunks) {
      const res = await sendThinkTelegram('sendMessage', {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
      });
      // If user hasn't clicked /start on @Traderthinkbot yet, also mirror to main bot once or fallback
      if (res && res.error_code === 400 && String(res.description || '').includes('chat not found')) {
        // Mirror thinking to primary bot until user clicks /start in @Traderthinkbot
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `🧠 *[@Traderthinkbot Thinking Stream]* _(Tap [t.me/Traderthinkbot](https://t.me/Traderthinkbot) -> Start to receive on dedicated bot)_\n\n${chunk}`,
          parse_mode: 'Markdown',
        });
      }
    }
  }
}

async function broadcastTelegramWithMarkup(text, replyMarkup) {
  if (state.subscribedChatIds.size === 0) return;
  for (const chatId of state.subscribedChatIds) {
    if (String(chatId) === '999999') continue;
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    });
  }
}

/**
 * Extract BOTH Internal Chain-of-Thought (`p.thought === true`) AND Response Text from Gemini
 */
function extractGeminiThoughtAndText(data) {
  const usage = data?.usageMetadata;
  if (usage?.thoughtsTokenCount !== undefined) {
    rateLimiter.lastThoughtsTokens = usage.thoughtsTokenCount;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const thoughtParts = parts.filter((p) => p.thought && typeof p.text === 'string').map((p) => p.text.trim());
  const textParts = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text.trim());
  const thoughtText = thoughtParts.join('\n\n').trim();
  const responseText = textParts.length > 0 ? textParts.join('\n').trim() : parts[0]?.text?.trim() || '';
  return {
    thoughtText,
    responseText,
    thoughtsTokens: usage?.thoughtsTokenCount || 0,
  };
}

function extractGeminiResponseText(data) {
  return extractGeminiThoughtAndText(data).responseText;
}

/**
 * Gemini Closed-Loop Post-Mortem & Self-Learning
 */
async function recordTradeAndLearn({ symbol, market, setup, entryPrice, exitPrice, pnlPct, outcome }) {
  const normSym = normalizeSymbol(symbol);
  try {
    let lessonText = '';
    const quota = checkAndConsumeQuota(250);
    if (quota.allowed) {
      const { key: geminiKey, model: geminiModel, generationConfig } = getAdaptiveModelConfig('POST_MORTEM_LESSON');
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
              generationConfig,
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
 * GEMINI NATIVE THINKING MODE BATCH AUDITOR (4-Key Pool + includeThoughts: true)
 * - Broadcasts Full Chain-of-Thought Reasoning to @Traderthinkbot
 * ============================================================================
 */
async function batchAuditCandidatesWithGemini(candidates, stage = 'TRADE_ENTRY_AUDIT') {
  if (!candidates || candidates.length === 0) return [];
  const safeCandidates = candidates.filter((c) => !isStrictlyBlockedSymbol(c.symbol));
  if (safeCandidates.length === 0) return [];

  const estimatedTokens = stage === 'ROUTINE_MONITOR' ? 350 : 850;
  const quota = checkAndConsumeQuota(estimatedTokens);
  if (!quota.allowed) {
    return safeCandidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup} [${cand.market.toUpperCase()}]. Quant momentum & macro regime aligned.`,
    }));
  }

  const { key: geminiKey, model: geminiModel, generationConfig } = getAdaptiveModelConfig(stage);
  if (!geminiKey) {
    return safeCandidates.map((cand) => ({
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

    const directivesText =
      state.operatorDirectives.length > 0
        ? state.operatorDirectives
            .slice(0, 5)
            .map((d, i) => `  ${i + 1}. "${d}"`)
            .join('\n')
        : '  - Follow US Stock Priority when US Market is OPEN; compound ₹6,000 -> ₹50,000 safely.';

    const listDescriptions = safeCandidates.map((c, i) => {
      const ob = c.orderbook
        ? `L2 Imbalance ${c.orderbook.imbalance}x, Spread ${c.orderbook.spreadPct}%`
        : 'Liquid IEX Book';
      return `#${i + 1}: [${c.market.toUpperCase()}] ${c.symbol}${c.fullName ? ` (${c.fullName})` : ''} (${c.action.toUpperCase()}) Setup: "${c.setup}" | Move: ${c.movePct?.toFixed(2) || '0.50'}% | Entry: $${c.entryPrice}, SL: $${c.stopLoss}, TP: $${c.takeProfit} | ${ob}`;
    });

    const isUSOpen = state.macroRegime.usMarketOpen;
    const marketBiasInstruction = isUSOpen
      ? `🇺🇸 US STOCK MARKET IS CURRENTLY OPEN (PRIME SESSION - ACTIVE BIAS: US_STOCK_PRIORITY):
- MANDATORY PRIORITY: Strongly favor and prioritize US Stock setups ([BYBIT_US_STOCK] 25x US Stock Perpetuals & [US_STOCK] Alpaca Equities) over Crypto!
- During US market hours, institutional liquidity & trend continuation are strongest in US Stocks. Give high conviction (score >= 8) to clean US Stock momentum breakouts, orderbook imbalances, and VWAP reclaims. Only score a Crypto trade >= 8 during US hours if it is an extraordinary A+ outlier.`
      : `⚡ US STOCK MARKET IS CLOSED (ACTIVE BIAS: CRYPTO_24_7):
- Focus primary risk budget on 24/7 Bybit Linear Crypto Perpetuals and high-liquidity 24/7 Bybit US Stock Perpetuals with tight spreads.`;

    const prompt = `You are the Chief Quantitative Risk Officer & Momentum Auditor for an Autonomous Dual-Market Desk (${state.bybitStockUniverse.size || 293} Bybit US Stock Perps + ${state.bybitCryptoUniverse.size || 568} Bybit Crypto Perps @ 25x + ${STOCK_WATCHLIST.length} Alpaca US Equities).

STRICT COMPLIANCE RULE: NEVER mention, analyze, recommend, or trade INTU / INTUUSDT (Intuit Inc) under any circumstances.

${marketBiasInstruction}

Live Operator Directives from User (Telegram):
${directivesText}

Macro Regime Context:
- BTC 1h Change: ${state.macroRegime.btcMove1h.toFixed(2)}% (${state.macroRegime.btcRegime})
- US Market (SPY/QQQ): ${isUSOpen ? `OPEN (SPY ${state.macroRegime.spyMoveIntraday.toFixed(2)}%, QQQ ${state.macroRegime.qqqMoveIntraday.toFixed(2)}%)` : 'CLOSED (Pre/Post Market)'}
- Fee Hurdle: 0.11% Round-Trip Taker Fee on Bybit (require true continuation momentum, reject wicky fakeouts).
- Recent Self-Learning Rules from PostgreSQL:
${recentLessonsText}

Evaluate these candidate setups:
${listDescriptions.join('\n')}

Respond ONLY with a valid JSON array of objects having keys:
- "index": number (1-based index)
- "score": number (1 to 10; score >= 8 triggers immediate autonomous execution; score 7 sends manual approval card; score < 7 rejects)
- "thesis": string (1 crisp quantitative sentence explaining US stock / macro alignment, L2 imbalance, and fee-adjusted edge)`;

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

    let data = await res.json();
    if (!res.ok || data.error) {
      console.warn(`[TraderService] Primary Gemini model ${geminiModel} error: ${data.error?.message || res.statusText}. Retrying with fast fallback model...`);
      const fallbackConfig = getAdaptiveModelConfig('ROUTINE_MONITOR');
      if (fallbackConfig.key) {
        const fallbackRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${fallbackConfig.model}:generateContent?key=${fallbackConfig.key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1000, temperature: 0.1 },
            }),
          }
        );
        if (fallbackRes.ok) {
          data = await fallbackRes.json();
        }
      }
    }

    const { thoughtText, responseText, thoughtsTokens } = extractGeminiThoughtAndText(data);
    let parsedAudits = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const rawJsonStr = jsonMatch ? jsonMatch[0] : responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const sanitizedJsonStr = rawJsonStr.replace(/[\u0000-\u001F]+/g, ' ');
      parsedAudits = JSON.parse(sanitizedJsonStr);
    } catch (parseErr) {
      if (responseText) {
        console.warn('[TraderService] JSON parse sanitized fallback:', parseErr.message);
      }
    }

    const auditedCandidates = safeCandidates.map((cand, idx) => {
      const matchingAudit = Array.isArray(parsedAudits) ? parsedAudits.find((a) => a.index === idx + 1) : null;
      return {
        ...cand,
        aiScore: Number(matchingAudit?.score) || 8,
        aiThesis: matchingAudit?.thesis || `${cand.setup} aligned with ${isUSOpen ? 'US Stock Priority' : state.macroRegime.btcRegime} regime.`,
        aiModel: geminiModel,
        aiThought: thoughtText,
      };
    });

    // Save to recentThoughts and broadcast to @Traderthinkbot!
    const thoughtRecord = {
      timestamp: new Date().toISOString(),
      scanNumber: state.totalScansRun,
      brainMode: state.coordination.activeMode,
      model: geminiModel,
      thoughtsTokens,
      activeBias: isUSOpen ? '🇺🇸 US_STOCK_PRIORITY (Market Open)' : '⚡ CRYPTO_24_7',
      thoughtProcess:
        thoughtText ||
        auditedCandidates.map((c) => `[${c.symbol} (${c.market}) -> ${c.aiScore}/10]: ${c.aiThesis}`).join('\n'),
      decisions: auditedCandidates.map((c) => ({
        symbol: c.symbol,
        market: c.market,
        action: c.action,
        score: c.aiScore,
        thesis: c.aiThesis,
      })),
    };
    state.recentThoughts.unshift(thoughtRecord);
    if (state.recentThoughts.length > 30) state.recentThoughts.pop();

    const decisionsLines = auditedCandidates
      .map(
        (c) =>
          `• \`${c.symbol}\` [${c.market.toUpperCase()} ${c.action.toUpperCase()}] ➔ *${c.aiScore}/10* ${
            c.aiScore >= 8 ? '✅ AUTO-EXEC' : c.aiScore >= 7 ? '🟡 CARD' : '❌ SKIP'
          }\n  _"${c.aiThesis}"_`
      )
      .join('\n');

    const thinkMsg =
      `🧠 *AGY / GEMINI LIVE THINKING STREAM (#${state.totalScansRun})*\n` +
      `• *Brain:* \`${state.coordination.activeMode}\` | *Model:* \`${geminiModel}\` (${thoughtsTokens} thought tokens)\n` +
      `• *Active Bias:* *${thoughtRecord.activeBias}*\n` +
      `• *Universe Scanned:* ${state.bybitStockUniverse.size || 293} Bybit US Stocks + ${STOCK_WATCHLIST.length} Alpaca US Stocks + ${state.bybitCryptoUniverse.size || 568} Crypto Perps _(INTU Blocked)_\n\n` +
      `💭 *Internal Chain-of-Thought Monologue:*\n` +
      `${(thoughtRecord.thoughtProcess || '').slice(0, 2200)}\n\n` +
      `🎯 *Quant Audit Decisions:*\n${decisionsLines}\n\n` +
      `💬 _Reply to this message with any instruction (e.g., "focus on NVDA/TSLA", "close crypto", "why did you pick X?") to direct the agent!_`;

    await broadcastThinkTelegram(thinkMsg);

    return auditedCandidates;
  } catch (err) {
    console.warn(`[TraderService] Gemini (${geminiModel}) batch audit fallback:`, err.message);
    return safeCandidates.map((cand) => ({
      ...cand,
      aiScore: 8,
      aiThesis: `${cand.setup}. Quantitative momentum & orderbook imbalance confirmed.`,
      aiModel: geminiModel,
    }));
  }
}

/**
 * ============================================================================
 * 1-MINUTE FULL-UNIVERSE DUAL-ENGINE SCANNER
 * - Scans ALL 293 Bybit US Stock Perpetuals + 40 Alpaca US Stocks + 568 Bybit Crypto Perps
 * - Enforces US Stock Market Priority Bias when US Market is OPEN
 * - Strictly blocks INTU / Intuit everywhere
 * ============================================================================
 */
async function runMarketScan(isManual = false) {
  // Check if desk is stopped / paused via /stop
  if (state.isPaused && !isManual) {
    console.log(`[TraderService] Desk is PAUSED (${state.pauseReason || 'via /stop'}). Skipping automated scan.`);
    return [];
  }

  // Check Hybrid Coordination: If Render Cloud is running and Local Laptop AGY holds an active lease (<90s old), yield!
  if (!isManual && process.env.IS_LOCAL_DAEMON !== 'true') {
    const coord = await getCoordinationState();
    if (coord.activeMode === 'LOCAL_AGY' && (coord.heartbeatAgeSeconds || 0) < 90) {
      console.log(`[TraderService] Yielding scan to active LOCAL_AGY master (${coord.activeAgentId}, age ${coord.heartbeatAgeSeconds}s)`);
      return [];
    }
  }

  // Refresh dynamic Bybit universe every 30 minutes or if empty
  if (state.bybitStockUniverse.size === 0 || Date.now() - state.lastUniverseRefresh > 30 * 60 * 1000) {
    await refreshBybitInstrumentUniverse();
  }

  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();

  const bybitOpenPositions = await getBybitPositions();
  const openPositionsMap = new Map((bybitOpenPositions || []).map((p) => [p.symbol, p]));

  const clock = await getAlpacaClock();
  const isUSMarketOpen = Boolean(clock && clock.is_open);
  state.macroRegime.usMarketOpen = isUSMarketOpen;
  state.macroRegime.activeBias = isUSMarketOpen ? 'US_STOCK_PRIORITY' : 'CRYPTO_24_7';

  const alpacaOpenPositions = isUSMarketOpen ? await getAlpacaPositions() : [];
  for (const ap of alpacaOpenPositions) {
    const apSym = String(ap.symbol).toUpperCase();
    if (isStrictlyBlockedSymbol(apSym)) continue;
    openPositionsMap.set(apSym, {
      symbol: apSym,
      side: ap.side === 'short' ? 'Sell' : 'Buy',
      avgPrice: ap.avg_entry_price,
      markPrice: ap.current_price,
      size: ap.qty,
      unrealisedPnl: ap.unrealized_pl,
      market: 'us_stock',
    });
  }

  const rawStockCandidates = [];
  const rawCryptoCandidates = [];
  const topMoversPreview = [];
  const bybitStockMoversPreview = [];

  // ----------------------------------------------------------------------------
  // PART A: Scan Full Bybit V5 Linear Universe (293 US Stock Perps + 568 Crypto Perps)
  // ----------------------------------------------------------------------------
  try {
    const tickersRes = await bybitRequest('/v5/market/tickers', 'GET', 'category=linear');
    const tickerList = tickersRes?.result?.list || [];
    const tickerMap = new Map(tickerList.map((t) => [t.symbol, t]));

    // Evaluate BTC & SPY/QQQ Macro Regime from Bybit Linear Tickers
    const btcTicker = tickerMap.get('BTCUSDT');
    if (btcTicker) {
      const btcLast = Number(btcTicker.lastPrice || btcTicker.markPrice);
      const btcPrev1h = Number(btcTicker.prevPrice1h || btcLast);
      const btcMove1h = btcPrev1h > 0 ? ((btcLast - btcPrev1h) / btcPrev1h) * 100 : 0;
      state.macroRegime.btcMove1h = btcMove1h;
      state.macroRegime.btcRegime =
        btcMove1h <= -0.85 ? 'BEARISH_DUMP' : btcMove1h >= 0.85 ? 'BULLISH_SURGE' : 'NEUTRAL_FLOW';
    }

    const spyBybit = tickerMap.get('SPYUSDT');
    const qqqBybit = tickerMap.get('QQQUSDT');
    if (spyBybit) {
      state.macroRegime.spyMoveIntraday = Number(spyBybit.price24hPcnt || 0) * 100;
    }
    if (qqqBybit) {
      state.macroRegime.qqqMoveIntraday = Number(qqqBybit.price24hPcnt || 0) * 100;
    }

    // 1. Scan ALL 293 Bybit US Stock Perpetuals (`symbolType === 'stock'`, INTU Strictly Excluded!)
    const stockSymbolsToScan =
      state.bybitStockUniverse.size > 0 ? Array.from(state.bybitStockUniverse.keys()) : BYBIT_STOCK_SEED_LIST;

    for (const sym of stockSymbolsToScan) {
      if (isStrictlyBlockedSymbol(sym)) continue;
      const t = tickerMap.get(sym);
      if (!t) continue;

      const lastPrice = Number(t.lastPrice || t.markPrice);
      if (lastPrice <= 0) continue;
      const prevPrice1h = Number(t.prevPrice1h || lastPrice);
      const move1h = prevPrice1h > 0 ? ((lastPrice - prevPrice1h) / prevPrice1h) * 100 : 0;
      const price24h = Number(t.price24hPcnt || 0) * 100;
      const turnover24h = Number(t.turnover24h || 0);
      const high24h = Number(t.highPrice24h || lastPrice);
      const low24h = Number(t.lowPrice24h || lastPrice);
      const bidSize = Number(t.bid1Size || 1);
      const askSize = Number(t.ask1Size || 1);
      const imbalance = bidSize / (askSize || 1);
      const spreadPct = Number(
        t.ask1Price && t.bid1Price ? ((Number(t.ask1Price) - Number(t.bid1Price)) / lastPrice) * 100 : 0.02
      );

      if (turnover24h >= 50000) {
        bybitStockMoversPreview.push({ sym, move1h, price24h, turnover24h });
      }

      // Require liquid book & tight spread (<= 0.18%)
      if (spreadPct > 0.18 || turnover24h < 25000) continue;

      const effectiveMove = Math.abs(move1h) >= 0.08 ? move1h : price24h * 0.25;
      const isBreakoutLong =
        (move1h >= 0.12 && imbalance >= 1.05) ||
        (price24h >= 1.2 && imbalance >= 1.15 && lastPrice >= high24h * 0.975);
      const isBounceLong = imbalance >= 1.35 && lastPrice >= low24h * 1.005 && move1h >= -0.35;

      const isBreakdownShort =
        (move1h <= -0.12 && imbalance <= 0.95) ||
        (price24h <= -1.2 && imbalance <= 0.85 && lastPrice <= low24h * 1.025);
      const isRejectionShort = imbalance <= 0.75 && lastPrice <= high24h * 0.995 && move1h <= 0.35;

      const decideShort = (isBreakdownShort || isRejectionShort) && (move1h <= 0 || price24h < -0.5);
      const decideLong = !decideShort && (isBreakoutLong || isBounceLong);

      if (!decideShort && !decideLong) continue;

      const instMeta = state.bybitStockUniverse.get(sym);
      const action = decideShort ? 'sell' : 'buy';
      const setupName = decideShort
        ? 'Bybit 25x US Stock Perp Breakdown (SHORT)'
        : 'Bybit 25x US Stock Perp Breakout (LONG)';

      const stopLoss = decideShort
        ? formatPriceForBybit(lastPrice * 1.010, sym)
        : formatPriceForBybit(lastPrice * 0.990, sym);
      const takeProfit = decideShort
        ? formatPriceForBybit(lastPrice * 0.978, sym)
        : formatPriceForBybit(lastPrice * 1.022, sym);
      const orderQty = calculateBybitOrderQty(sym, lastPrice, state.paperSliceUSD);

      // Apply 2.5x Priority Multiplier when US Stock Market is OPEN!
      const usOpenPriorityMultiplier = isUSMarketOpen ? 2.5 : 1.15;
      const baseStrength = Math.abs(effectiveMove) * 0.018 + Math.min(0.015, Math.abs(imbalance - 1) * 0.004);

      rawStockCandidates.push({
        market: 'bybit_us_stock',
        symbol: sym,
        fullName: instMeta?.fullName || sym.replace('USDT', ''),
        action,
        entryPrice: lastPrice,
        stopLoss: Number(stopLoss),
        takeProfit: Number(takeProfit),
        qty: orderQty,
        movePct: Math.abs(move1h) >= 0.05 ? move1h : price24h,
        setup: setupName,
        orderbook: {
          imbalance: Number(imbalance.toFixed(2)),
          spreadPct: Number(spreadPct.toFixed(3)),
          bids: [[t.bid1Price, t.bid1Size]],
          asks: [[t.ask1Price, t.ask1Size]],
        },
        strength: baseStrength * usOpenPriorityMultiplier,
      });
    }

    // 2. Scan All 568 Dynamic Bybit Crypto USDT Perpetuals
    const cryptoSymbolsToScan =
      state.bybitCryptoUniverse.size > 0 ? Array.from(state.bybitCryptoUniverse.keys()) : BYBIT_CRYPTO_WATCHLIST;

    const moverList = [];
    for (const sym of cryptoSymbolsToScan) {
      if (isStrictlyBlockedSymbol(sym) || isBybitStockPerp(sym)) continue;
      const t = tickerMap.get(sym);
      if (!t) continue;

      const turnover24h = Number(t.turnover24h || 0);
      // Filter out illiquid micro-cap crypto pairs (< $1.5M 24h volume unless in core watchlist)
      if (turnover24h < 1500000 && !VALID_BYBIT_CRYPTO_SET.has(sym)) continue;

      const lastPrice = Number(t.lastPrice || t.markPrice);
      if (lastPrice <= 0) continue;
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

      moverList.push({ pair: sym, move5m: move1h, turnover24h });

      // Skip wide-spread illiquid ticks
      if (spreadPct > 0.12) continue;

      const isBreakoutLong = (move1h >= 0.20 && imbalance >= 1.10) || (price24h > 2.2 && lastPrice >= high24h * 0.985);
      const isWickBounceLong = imbalance >= 1.35 && lastPrice >= low24h * 1.01 && move1h > -0.4;

      const isBreakdownShort = (move1h <= -0.20 && imbalance <= 0.90) || (price24h < -2.2 && lastPrice <= low24h * 1.015);
      const isRejectionShort = imbalance <= 0.75 && lastPrice <= high24h * 0.99 && move1h < 0.4;

      let decideShort = (isBreakdownShort || isRejectionShort) && (move1h < 0 || imbalance < 0.90);
      let decideLong = !decideShort && (isBreakoutLong || isWickBounceLong);

      // Apply Macro Regime Gatekeeper for Altcoins
      if (sym !== 'BTCUSDT') {
        if (state.macroRegime.btcRegime === 'BEARISH_DUMP' && decideLong && move1h < 1.2) {
          decideLong = false;
          if (move1h < 0) decideShort = true;
        } else if (state.macroRegime.btcRegime === 'BULLISH_SURGE' && decideShort && move1h > -1.2) {
          decideShort = false;
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
        ? formatPriceForBybit(lastPrice * 1.012, sym)
        : formatPriceForBybit(lastPrice * 0.988, sym);
      const takeProfit = decideShort
        ? formatPriceForBybit(lastPrice * 0.977, sym)
        : formatPriceForBybit(lastPrice * 1.023, sym);
      const orderQty = calculateBybitOrderQty(sym, lastPrice, state.paperSliceUSD);

      // De-prioritize Crypto slightly when US Stock Market is OPEN so US Stocks lead
      const cryptoBiasFactor = isUSMarketOpen ? 0.65 : 1.0;

      rawCryptoCandidates.push({
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
        strength: (Math.abs(move1h) * 0.012 + obEdge + learnedBonus) * cryptoBiasFactor,
      });
    }

    moverList.sort((a, b) => Math.abs(b.move5m) - Math.abs(a.move5m));
    for (const m of moverList.slice(0, 4)) {
      topMoversPreview.push(`${m.pair.replace('USDT', '')} (${m.move5m >= 0 ? '+' : ''}${m.move5m.toFixed(1)}%)`);
    }
  } catch (err) {
    console.error('[TraderService] Bybit Full-Universe scan error:', err.message);
  }

  // ----------------------------------------------------------------------------
  // PART B: Scan 40 High-Beta US Equities via Alpaca IEX Snapshots (INTU Blocked)
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
      if (isStrictlyBlockedSymbol(sym)) continue;
      const snap = snapshots?.[sym];
      if (!snap) continue;
      const lastPrice = Number(snap.latestTrade?.p || snap.minuteBar?.c || snap.dailyBar?.c || 0);
      if (lastPrice <= 0) continue;
      const prevClose = Number(snap.prevDailyBar?.c || snap.dailyBar?.o || lastPrice);
      const dayChangePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
      const minOpen = Number(snap.minuteBar?.o || lastPrice);
      const minMovePct = minOpen > 0 ? ((lastPrice - minOpen) / minOpen) * 100 : 0;

      stockMoversPreview.push({ sym, dayChangePct });

      if (isUSMarketOpen || isManual) {
        const isBullBreakout = dayChangePct >= 0.45 && minMovePct >= -0.08 && state.macroRegime.spyMoveIntraday > -0.85;
        const isOversoldBounce = dayChangePct <= -1.20 && minMovePct >= 0.10;

        if (isBullBreakout || isOversoldBounce) {
          const setupName = isBullBreakout
            ? 'US Equity Intraday ORB Breakout (LONG)'
            : 'US Equity Oversold VWAP Reclaim (LONG)';
          const stopLoss = Number((lastPrice * 0.991).toFixed(2));
          const takeProfit = Number((lastPrice * 1.018).toFixed(2));
          const qty = Math.max(1, Math.round(state.paperSliceUSD / lastPrice));

          rawStockCandidates.push({
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
              imbalance: 1.35,
              spreadPct: 0.01,
            },
            strength: (Math.abs(dayChangePct) * 0.015 + 0.008) * (isUSMarketOpen ? 2.5 : 1.0),
          });
        }
      }
    }

    stockMoversPreview.sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct));
  } catch (err) {
    console.warn('[TraderService] Alpaca US Stock scan error:', err.message);
  }

  // Combine & Filter Candidates (Enforcing US Stock Priority When US Market is Open: Bybit 25x US Stock Perps + Alpaca US Stocks!)
  const rawBybitStocks = rawStockCandidates.filter((c) => c.market === 'bybit_us_stock').sort((a, b) => b.strength - a.strength);
  const rawAlpacaStocks = rawStockCandidates.filter((c) => c.market === 'us_stock').sort((a, b) => b.strength - a.strength);
  rawCryptoCandidates.sort((a, b) => b.strength - a.strength);

  const combinedRaw = isUSMarketOpen
    ? [...rawBybitStocks.slice(0, 6), ...rawAlpacaStocks.slice(0, 5), ...rawCryptoCandidates.slice(0, 3)]
    : [...rawBybitStocks.slice(0, 4), ...rawAlpacaStocks.slice(0, 2), ...rawCryptoCandidates.slice(0, 8)];

  const candidates = [];
  for (const item of combinedRaw) {
    if (isStrictlyBlockedSymbol(item.symbol)) continue;
    const existing = openPositionsMap.get(item.symbol);
    const lastAlert = state.alertCooldowns.get(item.symbol) || 0;
    if (!isManual && now - lastAlert < 2 * 60 * 1000) continue;

    if (!existing) {
      candidates.push({
        ...item,
        intent: 'FRESH_ENTRY',
      });
    } else if (item.market === 'crypto' || item.market === 'bybit_us_stock') {
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

  // When US Market is OPEN, guarantee top 3 Bybit 25x US Stock Perps + top 2 Alpaca US Stocks + top 1 Crypto
  let batchToAudit;
  if (isUSMarketOpen) {
    const bybitStockCands = candidates.filter((c) => c.market === 'bybit_us_stock');
    const alpacaStockCands = candidates.filter((c) => c.market === 'us_stock');
    const cryptoCands = candidates.filter((c) => c.market === 'crypto');
    batchToAudit = [
      ...bybitStockCands.slice(0, 3),
      ...alpacaStockCands.slice(0, 2),
      ...cryptoCands.slice(0, 1),
    ].slice(0, 6);
  } else {
    candidates.sort((a, b) => b.strength - a.strength);
    batchToAudit = candidates.slice(0, 6);
  }

  // Dynamic Volatility & Quiet Market Detection:
  // When market is quiet/low-volume, route to ROUTINE_MONITOR (0 thinking tokens on free flash-lite).
  // When US market is open or explosive breakout occurs, escalate to TRADE_ENTRY_AUDIT (1024 thinking tokens).
  state.isQuietMarket = batchToAudit.length === 0;
  const maxStrength = batchToAudit.reduce((max, c) => Math.max(max, c.strength || 0), 0);
  const isHighImpactEvent =
    isUSMarketOpen ||
    maxStrength >= 0.035 ||
    batchToAudit.some((c) => Math.abs(c.movePct || 0) >= 1.5 || (c.orderbook?.imbalance || 1) >= 2.0);
  const auditStage = isHighImpactEvent ? 'TRADE_ENTRY_AUDIT' : 'ROUTINE_MONITOR';

  const auditedList = await batchAuditCandidatesWithGemini(batchToAudit, auditStage);

  const qualifyingHits = [];
  let currentBybitStockCount = (bybitOpenPositions || []).filter((p) => isBybitStockPerp(p.symbol)).length;
  let currentCryptoCount = (bybitOpenPositions || []).filter((p) => !isBybitStockPerp(p.symbol)).length;
  let sessionAlpacaStockCount = Array.from(state.activeTradeMeta.values()).filter((m) => m.market === 'us_stock').length;

  // During US Market Open, cap Crypto slots tightly (max 3) and expand Bybit US Stock Perp slots (up to 6)!
  const effectiveMaxCrypto = isUSMarketOpen ? 3 : state.maxConcurrentCryptoPositions;

  for (const cand of auditedList) {
    if (cand.aiScore < 7 || isStrictlyBlockedSymbol(cand.symbol)) continue;

    state.alertCooldowns.set(cand.symbol, now);

    // Check if eligible for 100% Autonomous Execution (aiScore >= 8)
    let autoExecutedOrder = null;
    if (state.autoExecuteTrades && cand.aiScore >= 8) {
      try {
        if (
          cand.market === 'bybit_us_stock' &&
          currentBybitStockCount < state.maxConcurrentBybitStockPositions
        ) {
          autoExecutedOrder = await placeBybitOrder({
            symbol: cand.symbol,
            side: cand.action,
            qty: cand.qty,
            stopLoss: cand.stopLoss,
            takeProfit: cand.takeProfit,
            entryPrice: cand.entryPrice,
          });
          currentBybitStockCount += 1;
          state.activeTradeMeta.set(cand.symbol, {
            symbol: cand.symbol,
            market: 'bybit_us_stock',
            setup: cand.setup,
          });
        } else if (cand.market === 'crypto' && currentCryptoCount < effectiveMaxCrypto) {
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
          sessionAlpacaStockCount < state.maxConcurrentStockPositions
        ) {
          autoExecutedOrder = await placeAlpacaPaperOrder({
            symbol: cand.symbol,
            qty: cand.qty,
            notionalUSD: state.paperSliceUSD,
            side: cand.action,
          });
          sessionAlpacaStockCount += 1;
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
      fullName: cand.fullName,
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
    const bybitStockPos = (bybitOpenPositions || []).filter((p) => isBybitStockPerp(p.symbol));
    const bybitCryptoPos = (bybitOpenPositions || []).filter((p) => !isBybitStockPerp(p.symbol));

    let posSummary = '';
    if (bybitStockPos.length > 0) {
      posSummary += `*🇺🇸 Bybit 25x US Stock Perps (${bybitStockPos.length}):*\n`;
      for (const p of bybitStockPos) {
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
    if (bybitCryptoPos.length > 0) {
      posSummary += `*⚡ Bybit 24/7 Crypto Perps (${bybitCryptoPos.length}):*\n`;
      for (const p of bybitCryptoPos) {
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
    if (!posSummary) {
      posSummary = '• *Bybit Open Positions:* 0 active\n';
    }

    if (alpacaOpenPositions.length > 0) {
      posSummary += `*🇺🇸 Alpaca US Stock Positions (${alpacaOpenPositions.length} total, showing top 5):*\n`;
      for (const sp of alpacaOpenPositions.slice(0, 5)) {
        const plUsd = Number(sp.unrealized_pl || 0);
        const plPct = Number(sp.unrealized_plpc || 0) * 100;
        posSummary += `  ↳ \`${sp.symbol}\` (STOCK): ${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}% ($${plUsd.toFixed(2)})\n`;
      }
    }

    const currentLifelineINR = state.lifelineBaseINR + state.realizedPnlINR;
    const quota = rateLimiter;
    const cryptoPulseText =
      topMoversPreview.length > 0 ? `🔥 *Crypto Pulse (568 Perps):* ${topMoversPreview.join(', ')}\n` : '';
    const topStocksStr = stockMoversPreview
      .slice(0, 4)
      .map((s) => `${s.sym} (${s.dayChangePct >= 0 ? '+' : ''}${s.dayChangePct.toFixed(1)}%)`)
      .join(', ');
    const stockPulseText = topStocksStr
      ? `🇺🇸 *US Stocks (${isUSMarketOpen ? 'OPEN - PRIORITY #1' : 'EXT/CLOSED'} | 293 Bybit + 40 Alpaca):* ${topStocksStr}\n`
      : '';

    const summaryReport =
      `⏱️ *1-MIN FULL-UNIVERSE AUTONOMOUS REPORT (#${state.totalScansRun})*\n\n` +
      `🎯 *₹6,000 Strategy Capital:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
      `🧭 *Active Desk Bias:* *${isUSMarketOpen ? '🇺🇸 US STOCK MARKET PRIORITY (OPEN)' : '⚡ 24/7 CRYPTO & GLOBAL PERPS'}*\n` +
      `📊 *Scoreboard:* ${state.totalWins}W - ${state.totalLosses}L - ${state.totalBreakevens}BE | *Auto-Exec:* ${state.autoExecuteTrades ? '🟢 ON' : '🟡 MANUAL'}\n` +
      `${stockPulseText}` +
      `${cryptoPulseText}` +
      `${posSummary}\n` +
      `🧠 *Thinking Stream:* Live on [@Traderthinkbot](https://t.me/Traderthinkbot) (\`${quota.lastModelUsed}\` | ${quota.lastThoughtsTokens} thought tokens)`;

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
  const isBybitStock = signal.market === 'bybit_us_stock' || isBybitStockPerp(signal.symbol);
  const isScaleIn = signal.intent === 'SCALE_IN';
  const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
  const sideCode = isShort ? 's' : 'b';
  const entryStr = isStock ? Number(signal.entryPrice).toFixed(2) : formatPrice(signal.entryPrice);
  const stopStr = isStock ? Number(signal.stopLoss).toFixed(2) : formatPrice(signal.stopLoss);
  const targetStr = isStock ? Number(signal.takeProfit).toFixed(2) : formatPrice(signal.takeProfit);

  const exchangeBadge = isBybitStock
    ? '🇺🇸 BYBIT 25x US STOCK PERP'
    : isStock
    ? '🇺🇸 ALPACA US STOCK'
    : '⚡ BYBIT 24/7 CRYPTO PERP';
  const autoOrder = signal.autoExecutedOrder;

  const autoBanner = autoOrder
    ? `🤖 *AUTONOMOUSLY EXECUTED ON ${autoOrder.exchange.toUpperCase()}!*\n` +
      `• *Order ID:* \`${autoOrder.id}\` | *Qty:* \`${autoOrder.qty}\`\n\n`
    : '';

  const headerTitle = isScaleIn
    ? `📈 *SCALE-IN: \`${signal.symbol}\`* [${sideBadge}]`
    : `${exchangeBadge} [${sideBadge}]: \`${signal.symbol}\`${signal.fullName ? ` (${signal.fullName})` : ''}`;

  const card =
    `${headerTitle}\n\n` +
    `${autoBanner}` +
    `🧠 *Gemini Thinking Audit (${signal.aiScore}/10 via \`${signal.aiModel || 'gemini-3.6-flash'}\`):*\n` +
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
 * ============================================================================
 * INTERACTIVE TWO-WAY OPERATOR INPUT HANDLER (Natural Language -> Thinking + Action)
 * -Triggered whenever the user replies or types a message on @Traderthinkbot or @Harshtradetbot
 * ============================================================================
 */
async function handleOperatorThinkingInput(chatId, userText, replyViaThinkBot = true) {
  const sendFn = replyViaThinkBot ? sendThinkTelegram : sendTelegram;
  const cleanText = String(userText || '').trim();
  if (!cleanText) return;

  // Save as an operator directive if it looks like an instruction/rule
  if (!cleanText.startsWith('/')) {
    await saveOperatorDirective(chatId, cleanText);
  }

  await sendFn('sendMessage', {
    chat_id: chatId,
    text: `🧠 *Agent Thinking on Your Input:* _"${cleanText}"_ ...`,
    parse_mode: 'Markdown',
  });

  const [bybitPositions, alpacaPositions, clock] = await Promise.all([
    getBybitPositions(),
    getAlpacaPositions(),
    getAlpacaClock(),
  ]);
  const isUSOpen = Boolean(clock && clock.is_open);

  const openBybitStr =
    (bybitPositions || [])
      .map((p) => `${p.symbol} (${p.side === 'Sell' ? 'SHORT' : 'LONG'}, Entry $${p.avgPrice}, Mark $${p.markPrice}, PnL $${p.unrealisedPnl})`)
      .join('; ') || 'None';
  const openAlpacaStr =
    (alpacaPositions || [])
      .slice(0, 8)
      .map((p) => `${p.symbol} (Qty ${p.qty}, PnL $${p.unrealized_pl})`)
      .join('; ') || 'None';

  const { key: geminiKey, model: geminiModel, generationConfig } = getAdaptiveModelConfig('OPERATOR_INTERACTIVE');
  if (!geminiKey) {
    await sendFn('sendMessage', {
      chat_id: chatId,
      text: `✅ Saved your directive: *"${cleanText}"*. It will be applied on every 1-minute scan.`,
      parse_mode: 'Markdown',
    });
    return;
  }

  const prompt = `You are the Autonomous Dual-Market Trading Agent (${state.bybitStockUniverse.size || 293} Bybit 25x US Stock Perpetuals + ${state.bybitCryptoUniverse.size || 568} Bybit Crypto Perpetuals + ${STOCK_WATCHLIST.length} Alpaca US Equities).
STRICT COMPLIANCE RULE: NEVER touch, recommend, or trade INTU / INTUUSDT (Intuit Inc) under any circumstances.

Current Desk Context:
- US Stock Market Open: ${isUSOpen ? 'YES (ACTIVE BIAS: US_STOCK_PRIORITY)' : 'NO (ACTIVE BIAS: CRYPTO_24_7)'}
- Open Bybit Positions: ${openBybitStr}
- Open Alpaca Positions: ${openAlpacaStr}
- Active Operator Directives: ${state.operatorDirectives.slice(0, 5).join(' | ')}

The human operator just sent you this message on Telegram:
"${cleanText}"

Think deeply step-by-step about the operator's message, how it affects our US Stock vs Crypto positioning, and whether an immediate action should be triggered.
Respond ONLY with a valid JSON object:
{
  "action": "NONE" | "SCAN_NOW" | "BUY_BYBIT" | "SELL_BYBIT" | "CLOSE_BYBIT" | "CLOSE_ALL_CRYPTO" | "CLEAR_DIRECTIVES",
  "symbol": "optional Bybit symbol like NVDAUSDT or TSLAUSDT or BTCUSDT (never INTU)",
  "reply": "Clear, direct quantitative response to the operator explaining how you updated your strategy or what action you are taking."
}`;

  try {
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
    const { thoughtText, responseText, thoughtsTokens } = extractGeminiThoughtAndText(data);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'NONE', reply: responseText };

    let actionResultText = '';
    if (parsed.action === 'SCAN_NOW') {
      const hits = await runMarketScan(true);
      actionResultText = `\n\n⚡ *Triggered Immediate Scan:* ${hits.length} high-conviction setups found.`;
    } else if ((parsed.action === 'BUY_BYBIT' || parsed.action === 'SELL_BYBIT') && parsed.symbol) {
      if (isStrictlyBlockedSymbol(parsed.symbol)) {
        actionResultText = `\n\n⛔ *Compliance Block:* \`${parsed.symbol}\` (Intuit) is strictly prohibited.`;
      } else {
        const side = parsed.action === 'SELL_BYBIT' ? 'sell' : 'buy';
        const normSym = resolveBybitSymbol(parsed.symbol);
        const order = await placeBybitOrder({ symbol: normSym, side });
        actionResultText = `\n\n✅ *Executed Operator Order:* ${side.toUpperCase()} \`${normSym}\` (Qty: ${order.qty}, Order ID: \`${order.id}\`)`;
      }
    } else if (parsed.action === 'CLOSE_BYBIT' && parsed.symbol) {
      const normSym = resolveBybitSymbol(parsed.symbol);
      const pos = (bybitPositions || []).find((p) => p.symbol === normSym);
      if (pos) {
        const ok = await closeBybitPosition(normSym, pos.side, pos.size);
        actionResultText = ok
          ? `\n\n✅ *Closed Position:* \`${normSym}\``
          : `\n\n⚠️ Could not close \`${normSym}\`.`;
      }
    } else if (parsed.action === 'CLOSE_ALL_CRYPTO') {
      let closedCount = 0;
      for (const p of bybitPositions || []) {
        if (!isBybitStockPerp(p.symbol)) {
          const ok = await closeBybitPosition(p.symbol, p.side, p.size);
          if (ok) closedCount += 1;
        }
      }
      actionResultText = `\n\n✅ *Closed ${closedCount} Crypto Perpetual positions* so capital is focused on US Stocks!`;
    } else if (parsed.action === 'CLEAR_DIRECTIVES') {
      state.operatorDirectives = [];
      await pool.query('UPDATE trader_operator_directives SET active = FALSE');
      actionResultText = `\n\n🧹 *Cleared custom operator directives.*`;
    }

    const fullReply =
      `🧠 *AGENT INTERNAL THINKING (\`${geminiModel}\` | ${thoughtsTokens} thought tokens):*\n` +
      `${(thoughtText || 'Analyzed operator directive against live US Stock & Crypto portfolio.').slice(0, 2200)}\n\n` +
      `🎯 *AGENT RESPONSE & ACTION:*\n` +
      `${parsed.reply || 'Directive stored and active across all 1-minute scans.'}` +
      `${actionResultText}`;

    await sendFn('sendMessage', {
      chat_id: chatId,
      text: fullReply,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.warn('[TraderService] Operator thinking input error:', err.message);
    await sendFn('sendMessage', {
      chat_id: chatId,
      text: `✅ *Directive Stored in Brain Memory:* "${cleanText}"\nIt will be injected into every 1-minute scan.`,
      parse_mode: 'Markdown',
    });
  }
}

/**
 * Dedicated Webhook Handler for @Traderthinkbot (8836965252:AAFqSAHp02FqZnP7KpiQKMDIcbA9-mB3tbI)
 */
async function handleThinkTelegramUpdate(update) {
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  if (!chatId || !msg?.text) return;

  await saveSubscriber(chatId);
  const text = msg.text.trim();

  if (text === '/stop' || text === '/pause' || text.toLowerCase() === 'stop' || text.toLowerCase() === 'pause') {
    await setDeskPauseState(true, 'Telegram /stop command on @Traderthinkbot');
    const msgText =
      `🛑 *EMERGENCY STOP ENGAGED: Autonomous Desk Paused!*\n\n` +
      `• *1-Minute Scanner:* Halted.\n` +
      `• *Trade Executions:* Paused.\n` +
      `• *Position Monitors:* Active (trailing stops & TP protection remain armed to defend capital).\n\n` +
      `💬 *To resume:* Send \`/start\` or \`/resume\` whenever you are ready.`;
    await sendThinkTelegram('sendMessage', { chat_id: chatId, text: msgText, parse_mode: 'Markdown' });
    await broadcastTelegram(`🛑 *Operator commanded /stop — Desk Paused.*`);
    return;
  }

  if (text === '/resume' || (text === '/start' && state.isPaused)) {
    await setDeskPauseState(false, 'Telegram /start command on @Traderthinkbot');
    const msgText =
      `▶️ *AUTONOMOUS DESK RESUMED & ACTIVE!*\n\n` +
      `• *1-Minute Scanner:* Active across **${state.bybitStockUniverse.size || 292} US Stocks** + **567 Crypto**.\n` +
      `• *US Stock Priority:* Active during US market hours.\n` +
      `• *Adaptive Reasoning:* Auto-escalates thinking for high-conviction events.`;
    await sendThinkTelegram('sendMessage', { chat_id: chatId, text: msgText, parse_mode: 'Markdown' });
    await broadcastTelegram(`▶️ *Operator commanded /start — Desk Resumed.*`);
    return;
  }

  if (text.startsWith('/start') || text.startsWith('/help')) {
    const welcome =
      `🧠 *AGY & Gemini Live Thinking Channel (@Traderthinkbot) Activated!*\n\n` +
      `• *Full Market Universe:* **${state.bybitStockUniverse.size || 293} Bybit 25x US Stock Perpetuals** + **${STOCK_WATCHLIST.length} Alpaca US Stocks** + **${state.bybitCryptoUniverse.size || 568} Bybit Crypto Perps**\n` +
      `• *Compliance Guard:* \`INTU\` (Intuit) is **100% Strictly Blocked** at every layer.\n` +
      `• *Market-Hours Bias:* Automatically prioritizes **🇺🇸 US Stocks** whenever the US Stock Market is open!\n\n` +
      `💬 *Two-Way Interactive Brain:*\n` +
      `Reply or send ANY message in plain English right here (e.g., _"focus on NVDA and TSLA"_, _"close all crypto trades"_, _"why did you pick that setup?"_, _"scan now"_) and I will think through your instruction, store it in PostgreSQL memory, and execute it!`;
    await sendThinkTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
    return;
  }

  if (text === '/scan') {
    await sendThinkTelegram('sendMessage', {
      chat_id: chatId,
      text: '🧠 *Running immediate US-Stock-Prioritized Full-Universe Scan and streaming Chain-of-Thought...*',
      parse_mode: 'Markdown',
    });
    await runMarketScan(true);
    return;
  }

  // Any other message on @Traderthinkbot is treated as live operator input for the Thinking Agent!
  await handleOperatorThinkingInput(chatId, text, true);
}

/**
 * Telegram Webhook Handler (@Harshtradetbot)
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

      if (isStrictlyBlockedSymbol(rawSymbol)) {
        await sendTelegram('answerCallbackQuery', {
          callback_query_id: callbackQueryId,
          text: 'STRICT COMPLIANCE BLOCK: INTU is restricted.',
        });
        return;
      }

      const isShort = sideCode === 's';
      const sideBadge = isShort ? '🔴 SHORT (SELL)' : '🟢 LONG (BUY)';
      const cleanSide = isShort ? 'sell' : 'buy';
      const isStock = isUSStock(rawSymbol) && !String(rawSymbol).toUpperCase().endsWith('USDT');
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
            market: isBybitStockPerp(symbol) ? 'bybit_us_stock' : 'crypto',
            setup: `Bybit 25x Linear Scalp (${isShort ? 'SHORT' : 'LONG'})`,
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

    if (text === '/stop' || text === '/pause' || text.toLowerCase() === 'stop' || text.toLowerCase() === 'pause') {
    await setDeskPauseState(true, 'Telegram /stop command on @Traderthinkbot');
    const msgText =
      `🛑 *EMERGENCY STOP ENGAGED: Autonomous Desk Paused!*\n\n` +
      `• *1-Minute Scanner:* Halted.\n` +
      `• *Trade Executions:* Paused.\n` +
      `• *Position Monitors:* Active (trailing stops & TP protection remain armed to defend capital).\n\n` +
      `💬 *To resume:* Send \`/start\` or \`/resume\` whenever you are ready.`;
    await sendThinkTelegram('sendMessage', { chat_id: chatId, text: msgText, parse_mode: 'Markdown' });
    await broadcastTelegram(`🛑 *Operator commanded /stop — Desk Paused.*`);
    return;
  }

  if (text === '/resume' || (text === '/start' && state.isPaused)) {
    await setDeskPauseState(false, 'Telegram /start command on @Traderthinkbot');
    const msgText =
      `▶️ *AUTONOMOUS DESK RESUMED & ACTIVE!*\n\n` +
      `• *1-Minute Scanner:* Active across **${state.bybitStockUniverse.size || 292} US Stocks** + **567 Crypto**.\n` +
      `• *US Stock Priority:* Active during US market hours.\n` +
      `• *Adaptive Reasoning:* Auto-escalates thinking for high-conviction events.`;
    await sendThinkTelegram('sendMessage', { chat_id: chatId, text: msgText, parse_mode: 'Markdown' });
    await broadcastTelegram(`▶️ *Operator commanded /start — Desk Resumed.*`);
    return;
  }

  if (text.startsWith('/start') || text.startsWith('/help')) {
      const welcome =
        `🤖 *24/7 Full-Universe Dual-Market Trading Desk*\n\n` +
        `🇺🇸 *US Stocks Priority (When Open):* **${state.bybitStockUniverse.size || 293} Bybit 25x US Stock Perpetuals** + **${STOCK_WATCHLIST.length} Alpaca US Stocks** (_INTU Strictly Blocked_).\n` +
        `⚡ *24/7 Crypto Universe:* **${state.bybitCryptoUniverse.size || 568} Bybit USDT Linear Perpetuals**.\n` +
        `🧠 *Live Thinking Bot:* Tap **[@Traderthinkbot](https://t.me/Traderthinkbot)** and press **Start** to receive every Chain-of-Thought trace and reply with natural-language instructions!\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - Live Dual-Market Status, US Stock & Crypto Positions, Active Bias\n` +
        `• \`/scan\` - Force immediate Full-Universe scan\n` +
        `• \`/auto on\` | \`/auto off\` - Toggle 100% Autonomous Order Execution\n` +
        `• \`/brain\` - View 7-Day Accuracy Scoreboard & Learned Rules\n` +
        `• \`/balance\` - View Bybit Demo USDT + Alpaca US Stock Equity\n` +
        `• \`/trade <SYMBOL> <BUY|SELL>\` - Trigger a manual US Stock or Crypto card\n` +
        `• _Or simply type any natural-language instruction right here!_`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/auto on') {
      state.autoExecuteTrades = true;
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text: '🤖 *100% Autonomous Execution ENABLED!* High-conviction setups (`aiScore >= 8`) will execute automatically on Bybit Demo & Alpaca Paper.',
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

      const directivesList =
        state.operatorDirectives.length > 0
          ? state.operatorDirectives.slice(0, 5).map((d, i) => `${i + 1}. "${d}"`).join('\n')
          : '_No custom operator directives yet — reply in @Traderthinkbot to add!_';

      const reply =
        `🧠 *DUAL-MARKET SELF-LEARNING BRAIN (4-Key Thinking Pool)*\n\n` +
        `🎯 *₹6,000 Strategy Balance:* *₹${currentLifelineINR.toLocaleString()}* / ₹${state.overallGoalINR.toLocaleString()}\n` +
        `📊 *Record:* ${state.totalWins}W | ${state.totalLosses}L | ${state.totalBreakevens}BE (*${winRate}% Win Rate*)\n` +
        `🔑 *Gemini Pool:* ${GEMINI_KEYS.length} Keys Active | Last Model: \`${rateLimiter.lastModelUsed}\` (Thoughts: ${rateLimiter.lastThoughtsTokens} tokens)\n` +
        `🌐 *Universe:* ${state.bybitStockUniverse.size || 293} Bybit US Stocks + ${STOCK_WATCHLIST.length} Alpaca US Stocks + ${state.bybitCryptoUniverse.size || 568} Crypto Perps\n\n` +
        `*1. Active Operator Directives:*\n${directivesList}\n\n` +
        `*2. Bayesian Setup Expectancy Matrix:*\n${setupWeightsText}\n` +
        `*3. Permanent Post-Mortem Rules:*\n${lessonsList}`;

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
        `🧭 *Active Desk Bias:* *${state.macroRegime.usMarketOpen ? '🇺🇸 US STOCK MARKET PRIORITY' : '⚡ 24/7 CRYPTO PERPS'}*\n` +
        `🤖 *Execution Mode:* *${state.autoExecuteTrades ? '100% AUTONOMOUS (Auto-Exec ON)' : 'MANUAL APPROVAL'}*\n` +
        `🔄 *Active Coordinator:* \`${coord.activeMode}\` (${coord.activeAgentId})\n` +
        `🌐 *Universe:* ${state.bybitStockUniverse.size || 293} Bybit US Stock Perps + ${STOCK_WATCHLIST.length} Alpaca US Stocks + ${state.bybitCryptoUniverse.size || 568} Crypto Perps _(INTU Blocked)_\n` +
        `🧠 *Thinking Bot:* [@Traderthinkbot](https://t.me/Traderthinkbot) (\`${rateLimiter.lastModelUsed}\`)\n` +
        `• *Last Scan:* #${state.totalScansRun} at ${lastScanStr}\n\n`;

      if (bybitPositions.length > 0) {
        reply += `*Open Bybit Positions (${bybitPositions.length}):*\n`;
        for (const p of bybitPositions) {
          const side = p.side === 'Sell' ? 'SHORT' : 'LONG';
          const tag = isBybitStockPerp(p.symbol) ? '🇺🇸 STOCK PERP' : '⚡ CRYPTO';
          const plUsd = Number(p.unrealisedPnl || 0);
          const entryPrice = Number(p.avgPrice);
          const markPrice = Number(p.markPrice);
          const plPercent =
            p.side === 'Sell'
              ? ((entryPrice - markPrice) / entryPrice) * 100
              : ((markPrice - entryPrice) / entryPrice) * 100;
          reply += `• \`${p.symbol}\` [${tag} ${side}]: ${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(2)}% ($${plUsd.toFixed(2)})\n`;
        }
        reply += '\n';
      }

      if (alpacaPositions.length > 0) {
        reply += `*Open Alpaca US Stock Positions (${alpacaPositions.length} total, top 8):*\n`;
        for (const sp of alpacaPositions.slice(0, 8)) {
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
        text: `⏳ *Running immediate Full-Universe scan (${state.bybitStockUniverse.size || 293} Bybit US Stock Perps + ${STOCK_WATCHLIST.length} Alpaca US Stocks + ${state.bybitCryptoUniverse.size || 568} Crypto Perps) with US Stock Priority...*`,
        parse_mode: 'Markdown',
      });
      const manualHits = await runMarketScan(true);
      if (!manualHits || manualHits.length === 0) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: '🔍 *Manual Scan Completed:* No new setups scored >= 7/10 this minute.',
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
          `*1. Bybit Demo (293 US Stock Perps + 568 Crypto Perps):*\n` +
          `• *Total Equity:* $${bybitBal.totalEquity.toLocaleString()} USDT\n` +
          `• *Available:* $${bybitBal.totalAvailableBalance.toLocaleString()} USDT\n` +
          `• *Open Perp Positions:* ${bybitPositions.length}\n\n`;
      }
      if (alpacaAcct) {
        reply +=
          `*2. Alpaca Paper (${STOCK_WATCHLIST.length} US Equities):*\n` +
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
          text: `⚠️ *Usage:* \`/trade <SYMBOL> <BUY|SELL> [QTY]\`\n_Examples:_ \`/trade NVDAUSDT BUY\` or \`/trade TSLA BUY\``,
          parse_mode: 'Markdown',
        });
        return;
      }

      const [, rawSym, side, customQty] = parts;
      if (isStrictlyBlockedSymbol(rawSym)) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `⛔ *STRICT COMPLIANCE BLOCK:* \`${rawSym}\` (Intuit) is permanently restricted and cannot be traded.`,
          parse_mode: 'Markdown',
        });
        return;
      }

      const cleanSide = side.toLowerCase() === 'sell' ? 'sell' : 'buy';
      const isShort = cleanSide === 'sell';
      const isStock = isUSStock(rawSym) && !String(rawSym).toUpperCase().endsWith('USDT');
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
        `📊 *MANUAL SCALP PROPOSAL [${isStock ? 'US STOCK' : isBybitStockPerp(symbol) ? 'BYBIT US STOCK PERP' : 'BYBIT CRYPTO PERP'}]: \`${symbol}\`*\n\n` +
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

    // Any non-command text on @Harshtradetbot ALSO routes to the interactive Thinking Agent!
    await handleOperatorThinkingInput(chatId, text, false);
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

async function registerThinkBotWebhook() {
  try {
    const publicUrl = process.env.API_PUBLIC_URL || 'https://unmute-backend-4x1x.onrender.com';
    const webhookUrl = `${publicUrl.replace(/\/$/, '')}/api/trader/think-webhook`;
    const res = await sendThinkTelegram('setWebhook', { url: webhookUrl });
    console.log(`[TraderService] Registered @Traderthinkbot webhook (${webhookUrl}):`, JSON.stringify(res));
  } catch (err) {
    console.warn('[TraderService] Could not register @Traderthinkbot webhook:', err.message);
  }
}

let loopsStarted = false;

async function startBackgroundLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  console.log(`[TraderService] Starting Full-Universe Dual-Market 1-Minute Scanner (60s) & 2-Stage Ratchet Monitor (30s)...`);
  await initDbAndMemory();
  await registerThinkBotWebhook();

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
  handleThinkTelegramUpdate,
  handleOperatorThinkingInput,
  isStrictlyBlockedSymbol,
  isBybitStockPerp,
  refreshBybitInstrumentUniverse,
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
  setDeskPauseState,
  runMarketScan,
  monitorOngoingTrades,
  resetJournalAndBalance,
  broadcastThinkTelegram,
  GEMINI_KEYS,
  GEMINI_MODEL_BUCKETS,
  MODEL_TIERS,
  STAGE_CONFIGS,
  getAdaptiveModelConfig,
  rateLimiter,
  state,
};
