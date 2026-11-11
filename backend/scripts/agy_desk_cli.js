'use strict';

/**
 * AGY Local Master CLI Bridge (`agy_desk_cli.js`)
 *
 * Allows the local Antigravity (`agy`) agent (running Gemini 4 Argon High on Google AI Pro credits)
 * to take over from Render's Gemini API, inspect live Bybit + Alpaca market data, show its full
 * Thinking Process in the terminal & Telegram, and execute/trail positions directly.
 *
 * Usage:
 *   node E:\unmute2\backend\scripts\agy_desk_cli.js pull
 *   node E:\unmute2\backend\scripts\agy_desk_cli.js execute <SYMBOL> <BUY|SELL> <SL> <TP> "<THINKING_THESIS>"
 *   node E:\unmute2\backend\scripts\agy_desk_cli.js handoff
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const traderService = require('../src/services/traderService');

const RENDER_URL = process.env.RENDER_BACKEND_URL || 'https://unmute-backend-4x1x.onrender.com';
const AGENT_ID = 'agy-local-gemini-4-argon';

async function notifyRenderHeartbeat(mode = 'LOCAL_AGY') {
  try {
    await fetch(`${RENDER_URL}/api/trader/coordination/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, agentId: AGENT_ID }),
    });
  } catch (e) {
    // Ignore if Render is restarting
  }
  await traderService.updateHeartbeat(mode, AGENT_ID);
}

async function cmdPull() {
  // 1. Claim LOCAL_AGY lease so Render pauses its free Gemini API scanner
  await notifyRenderHeartbeat('LOCAL_AGY');

  // 2. Also run the 2-Stage Fee-Adjusted Breakeven Ratchet on any open positions
  await traderService.monitorOngoingTrades();

  // 3. Fetch live Dual-Market state
  const [bybitBalance, bybitPositions, alpacaClock, alpacaAccount, alpacaPositions, snapshots] =
    await Promise.all([
      traderService.getBybitWalletBalance(),
      traderService.getBybitPositions(),
      traderService.getAlpacaClock(),
      traderService.getAlpacaAccount(),
      traderService.getAlpacaPositions(),
      traderService.getAlpacaStockSnapshots(),
    ]);

  // 4. Fetch top Bybit Crypto movers & orderbook imbalance
  const https = require('https');
  const tickersRaw = await new Promise((resolve) => {
    https
      .get('https://api-demo.bybit.com/v5/market/tickers?category=linear', (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({});
          }
        });
      })
      .on('error', () => resolve({}));
  });

  const watchlist = [
    'SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'XRPUSDT',
    'AVAXUSDT', 'LINKUSDT', 'PEPEUSDT', 'SHIBUSDT', 'ADAUSDT',
    'NEARUSDT', 'SUIUSDT', 'APTUSDT', 'WIFUSDT', 'BONKUSDT',
    'ARBUSDT', 'OPUSDT', 'LTCUSDT', 'BNBUSDT', 'INJUSDT',
  ];
  const tickerMap = new Map((tickersRaw?.result?.list || []).map((t) => [t.symbol, t]));

  const cryptoMovers = [];
  for (const sym of watchlist) {
    const t = tickerMap.get(sym);
    if (!t) continue;
    const lastPrice = Number(t.lastPrice || t.markPrice);
    const prev1h = Number(t.prevPrice1h || lastPrice);
    const move1h = prev1h > 0 ? ((lastPrice - prev1h) / prev1h) * 100 : 0;
    const move24h = Number(t.price24hPcnt || 0) * 100;
    const bidSize = Number(t.bid1Size || 1);
    const askSize = Number(t.ask1Size || 1);
    const imbalance = bidSize / (askSize || 1);
    const spreadPct =
      t.ask1Price && t.bid1Price ? ((Number(t.ask1Price) - Number(t.bid1Price)) / lastPrice) * 100 : 0.02;

    cryptoMovers.push({
      symbol: sym,
      lastPrice,
      move1hPct: Number(move1h.toFixed(2)),
      move24hPct: Number(move24h.toFixed(2)),
      l2BidAskImbalance: Number(imbalance.toFixed(2)),
      spreadPct: Number(spreadPct.toFixed(4)),
    });
  }
  cryptoMovers.sort((a, b) => Math.abs(b.move1hPct) - Math.abs(a.move1hPct));

  const stockMovers = [];
  for (const [sym, snap] of Object.entries(snapshots || {})) {
    const lastPrice = Number(snap?.latestTrade?.p || snap?.minuteBar?.c || snap?.dailyBar?.c || 0);
    const prevClose = Number(snap?.prevDailyBar?.c || lastPrice);
    const dayChangePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
    stockMovers.push({
      symbol: sym,
      lastPrice,
      dayChangePct: Number(dayChangePct.toFixed(2)),
    });
  }
  stockMovers.sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct));

  const payload = {
    coordination: {
      activeMode: 'LOCAL_AGY',
      agentId: AGENT_ID,
      renderCloudStatus: 'PAUSED_YIELDING_TO_LAPTOP_AGY',
    },
    bybitCrypto: {
      equityUSDT: bybitBalance?.totalEquity || 0,
      availableUSDT: bybitBalance?.totalAvailableBalance || 0,
      openPositions: (bybitPositions || []).map((p) => ({
        symbol: p.symbol,
        side: p.side,
        size: p.size,
        avgEntryPrice: Number(p.avgPrice),
        markPrice: Number(p.markPrice),
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        unrealisedPnlUSD: Number(p.unrealisedPnl),
      })),
      topMovers: cryptoMovers.slice(0, 8),
    },
    alpacaUSStocks: {
      marketOpen: Boolean(alpacaClock && alpacaClock.is_open),
      equityUSD: Number(alpacaAccount?.equity || 0),
      openPositions: (alpacaPositions || []).map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        avgEntryPrice: Number(p.avg_entry_price),
        currentPrice: Number(p.current_price),
        unrealizedPlUSD: Number(p.unrealized_pl),
      })),
      topMovers: stockMovers.slice(0, 8),
    },
  };

  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

async function cmdExecute(symbol, side, stopLoss, takeProfit, thinkingThesis) {
  await notifyRenderHeartbeat('LOCAL_AGY');
  const isStock = /^[A-Z]{1,5}$/.test(symbol) && !symbol.endsWith('USDT');

  let order;
  if (isStock) {
    order = await traderService.placeAlpacaPaperOrder({
      symbol,
      notionalUSD: 250,
      side,
    });
  } else {
    order = await traderService.placeBybitOrder({
      symbol,
      side,
      stopLoss: Number(stopLoss),
      takeProfit: Number(takeProfit),
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        executedBy: 'LOCAL_AGY_GEMINI_4_ARGON',
        order,
        thinkingThesis,
      },
      null,
      2
    )
  );
  process.exit(0);
}

async function cmdHandoff() {
  try {
    await fetch(`${RENDER_URL}/api/trader/coordination/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetMode: 'RENDER_CLOUD', agentId: 'laptop-handoff' }),
    });
  } catch (e) {
    // Ignore
  }
  await traderService.handoffControl('RENDER_CLOUD', 'laptop-handoff');
  console.log(JSON.stringify({ ok: true, activeMode: 'RENDER_CLOUD', message: 'Render Cloud 4-Key Gemini Pool has resumed 24/7 control.' }));
  process.exit(0);
}

const [, , action, arg1, arg2, arg3, arg4, arg5] = process.argv;
if (action === 'pull') {
  cmdPull();
} else if (action === 'execute') {
  cmdExecute(arg1, arg2, arg3, arg4, arg5 || 'Executed by Local AGY Master Agent');
} else if (action === 'handoff') {
  cmdHandoff();
} else {
  console.log('Usage: node agy_desk_cli.js [pull | execute <SYM> <BUY|SELL> <SL> <TP> "<THESIS>" | handoff]');
  process.exit(0);
}
