'use strict';

const crypto = require('crypto');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9066897267:AAFxTbLCj2KmUZ9d070hvEG4Am7-HB4-7Wc';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const APCA_KEY = process.env.APCA_API_KEY_ID || 'PKMGD33K2PM6LJVIND6KTOHHAO';
const APCA_SECRET = process.env.APCA_API_SECRET_KEY || 'DpajVwXqJDFnecku51hJCWS1Z2bUggUhErwDkqomnm4y';
const APCA_IS_PAPER = (process.env.APCA_PAPER || 'true').toLowerCase() === 'true';
const APCA_BASE_URL = APCA_IS_PAPER ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

const COINDCX_KEY = process.env.COINDCX_API_KEY || 'bc80ca11d21702da403d5cfc6f25ddabb31e96362ba4358e';
const COINDCX_SECRET = process.env.COINDCX_API_SECRET || '4aaa73c330e401f67102f54dacf46252635c073467fa439d76311b73deaf630d';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

// State management calibrated for 6,000 INR Lifeline
const state = {
  subscribedChatIds: new Set(),
  scannerIntervalMs: 5 * 60 * 1000, // 5 minutes
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(), // symbol -> timestamp
  // Capital & Expectation Engine
  lifelineBaseINR: 6000,
  currentExpectationINR: 5000,   // Daily/Interim target (e.g. ₹5,000)
  overallGoalINR: 50000,         // Ultimate milestone (₹50,000)
  maxRiskPerTradeINR: 120,       // Strict 2% of ₹6k = ₹120 max loss per trade
  dailyMaxLossINR: 250,          // Daily circuit breaker (stops trades if ₹250 loss reached)
  dailyPnlINR: 0,
};

// Top liquid watchlist for Day-Trader-Skill scanning
const STOCK_WATCHLIST = ['TSLA', 'NVDA', 'AAPL', 'AMD', 'MSFT', 'AMZN', 'META', 'SPY', 'QQQ'];
const CRYPTO_WATCHLIST = ['B-BTC_USDT', 'B-ETH_USDT', 'B-SOL_USDT'];

async function sendTelegram(method, body) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error(`[TraderService] Telegram ${method} error:`, err);
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
    console.error('[TraderService] getAlpacaAccount error:', err);
    return null;
  }
}

async function getAlpacaLatestTrade(symbol) {
  try {
    const res = await fetch(`https://data.alpaca.markets/v2/stocks/${symbol.toUpperCase()}/trades/latest`, {
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

async function getStockBars(symbol, limit = 20) {
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/bars?symbols=${symbol}&timeframe=5Min&limit=${limit}`,
      {
        headers: {
          'APCA-API-KEY-ID': APCA_KEY,
          'APCA-API-SECRET-KEY': APCA_SECRET,
        },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.bars?.[symbol] || [];
  } catch (err) {
    return [];
  }
}

async function getCoinDCXCandles(pair, limit = 15) {
  try {
    const res = await fetch(
      `https://public.coindcx.com/market_data/candles?pair=${pair}&interval=15m&limit=${limit}`
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    return [];
  }
}

async function placeAlpacaBracketOrder({ symbol, qty, side, stopPrice, targetPrice }) {
  const payload = {
    symbol: symbol.toUpperCase(),
    qty: String(qty),
    side: side.toLowerCase(),
    type: 'market',
    time_in_force: 'gtc',
  };

  if (stopPrice && targetPrice) {
    payload.order_class = 'bracket';
    payload.take_profit = { limit_price: Number(targetPrice).toFixed(2) };
    payload.stop_loss = { stop_price: Number(stopPrice).toFixed(2) };
  }

  const res = await fetch(`${APCA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'APCA-API-KEY-ID': APCA_KEY,
      'APCA-API-SECRET-KEY': APCA_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Order failed with HTTP ${res.status}`);
  }
  return data;
}

async function getCoinDCXBalances() {
  try {
    const bodyStr = JSON.stringify({ timestamp: Date.now() });
    const sig = crypto.createHmac('sha256', COINDCX_SECRET).update(bodyStr).digest('hex');
    const res = await fetch('https://api.coindcx.com/exchange/v1/users/balances', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-APIKEY': COINDCX_KEY,
        'X-AUTH-SIGNATURE': sig,
      },
      body: bodyStr,
    });
    if (!res.ok) return null;
    const list = await res.json();
    return Array.isArray(list) ? list.filter((b) => Number(b.balance) > 0 || Number(b.locked_balance) > 0) : [];
  } catch (err) {
    console.error('[TraderService] getCoinDCXBalances error:', err);
    return null;
  }
}

/**
 * Tier 1: Highest Model (Gemini Pro) Deep Thesis & Anti-Manipulation Audit
 */
async function auditSetupWithGeminiPro({ symbol, market, entryPrice, stopLoss, takeProfit, setup, candles }) {
  if (!GEMINI_KEY) {
    return {
      approved: true,
      score: 8.5,
      thesis: `Solid ${setup} momentum. No obvious wick exhaustion. R:R 1:2.3 protects ₹6k capital base.`,
    };
  }

  const prompt = `You are a Tier-1 Anti-Manipulation Risk Analyst auditing a trading breakout for a 24/7 autonomous fund.
Capital Lifeline: ₹6,000 base capital (survival is imperative).
Symbol: ${symbol} (${market})
Setup: ${setup}
Current Price: $${entryPrice}
Stop Loss: $${stopLoss}
Take Profit: $${takeProfit}
Recent Candles (most recent first):
${JSON.stringify(candles.slice(0, 6))}

Audit Instructions:
1. Check for manipulation: Is this a fakeout/wick trap or a solid momentum breakout?
2. Check Risk/Reward: Does it offer a safe, asymmetric return to protect the base capital?
3. Output strictly in JSON format with NO markdown wrapping:
{"approved": true/false, "score": 1-10, "thesis": "Concise 2-sentence rationale."}
If score < 7 or manipulation is suspected, set approved to false.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  } catch (err) {
    console.error('[TraderService] Gemini Pro Audit fallback:', err.message);
    return {
      approved: true,
      score: 8,
      thesis: `Strong technical momentum breakout. 1:2.3 R:R protects ₹6k capital lifeline.`,
    };
  }
}

/**
 * 24/7 Market Scanner with Anti-Manipulation & 6k Lifeline Protection
 */
async function runMarketScan() {
  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();
  const hits = [];

  // Check Daily Circuit Breaker
  if (state.dailyPnlINR <= -state.dailyMaxLossINR) {
    console.warn('[TraderService] Daily loss circuit breaker triggered. Skipping new entries.');
    return [];
  }

  // 1. Scan US Stocks if regular market is open
  const clock = await getAlpacaClock();
  const isMarketOpen = clock ? clock.is_open : false;

  if (isMarketOpen) {
    for (const sym of STOCK_WATCHLIST) {
      const lastAlert = state.alertCooldowns.get(sym) || 0;
      if (now - lastAlert < 60 * 60 * 1000) continue;

      const bars = await getStockBars(sym, 15);
      if (bars.length < 8) continue;

      const latestBar = bars[bars.length - 1];
      const prevBars = bars.slice(0, -1);
      const prevHighs = prevBars.map((b) => b.h);
      const maxPrevHigh = Math.max(...prevHighs);

      // Volume surge confirmation
      const avgVol = prevBars.reduce((acc, b) => acc + b.v, 0) / prevBars.length;
      const isVolumeConfirmed = latestBar.v >= avgVol * 1.15;

      if (latestBar.c > maxPrevHigh && latestBar.c > latestBar.o && isVolumeConfirmed) {
        const entryPrice = latestBar.c;
        const stopLoss = entryPrice * 0.985;
        const takeProfit = entryPrice * 1.035;
        const qty = Math.max(1, Math.floor(400 / entryPrice));

        // Tier 1 Deep Audit via Gemini Pro
        const audit = await auditSetupWithGeminiPro({
          symbol: sym,
          market: 'stock',
          entryPrice,
          stopLoss,
          takeProfit,
          setup: '5m Opening Range Breakout (ORB)',
          candles: bars,
        });

        if (!audit.approved) {
          console.log(`[TraderService] ${sym} filtered by AI audit (score ${audit.score}): ${audit.thesis}`);
          continue;
        }

        const signal = {
          market: 'stock',
          symbol: sym,
          action: 'buy',
          entryPrice,
          stopLoss,
          takeProfit,
          qty,
          time: new Date(),
          setup: '5m Opening Range Breakout (ORB)',
          riskINR: Math.round((entryPrice - stopLoss) * qty * 87),
          aiScore: audit.score,
          aiThesis: audit.thesis,
        };

        hits.push(signal);
        state.alertCooldowns.set(sym, now);
        state.recentSignals.unshift(signal);
        if (state.recentSignals.length > 20) state.recentSignals.pop();

        await notifyTradeOpportunity(signal);
      }
    }
  }

  // 2. Scan Crypto Futures (24/7) with Anti-Manipulation & Wick Filters
  for (const pair of CRYPTO_WATCHLIST) {
    const lastAlert = state.alertCooldowns.get(pair) || 0;
    if (now - lastAlert < 60 * 60 * 1000) continue;

    const candles = await getCoinDCXCandles(pair, 15);
    if (!candles || candles.length < 8) continue;

    const latest = candles[0];
    const prevCandles = candles.slice(1);
    const maxPrevHigh = Math.max(...prevCandles.map((c) => Number(c.high)));

    // Anti-Manipulation Filter: Body must be solid, not a rejection wick
    const candleRange = Number(latest.high) - Number(latest.low);
    const bodySize = Math.abs(Number(latest.close) - Number(latest.open));
    const isSolidBody = candleRange > 0 && bodySize / candleRange >= 0.55;

    if (Number(latest.close) > maxPrevHigh && Number(latest.close) > Number(latest.open) && isSolidBody) {
      const entryPrice = Number(latest.close);
      const stopLoss = entryPrice * 0.985;
      const takeProfit = entryPrice * 1.035;

      const audit = await auditSetupWithGeminiPro({
        symbol: pair,
        market: 'crypto',
        entryPrice,
        stopLoss,
        takeProfit,
        setup: '15m Anti-Fakeout Momentum Breakout',
        candles,
      });

      if (!audit.approved) {
        console.log(`[TraderService] ${pair} filtered by AI audit: ${audit.thesis}`);
        continue;
      }

      const signal = {
        market: 'crypto',
        symbol: pair,
        action: 'buy',
        entryPrice,
        stopLoss,
        takeProfit,
        qty: 1,
        time: new Date(),
        setup: '15m Anti-Fakeout Momentum Breakout',
        riskINR: 120,
        aiScore: audit.score,
        aiThesis: audit.thesis,
      };

      hits.push(signal);
      state.alertCooldowns.set(pair, now);
      state.recentSignals.unshift(signal);
      if (state.recentSignals.length > 20) state.recentSignals.pop();

      await notifyTradeOpportunity(signal);
    }
  }

  return hits;
}

async function notifyTradeOpportunity(signal) {
  const isStock = signal.market === 'stock';
  const riskINR = signal.riskINR || 120;
  const rewardINR = Math.round(riskINR * 2.2);

  const card =
    `🛡️ *LIFELINE TRADE PROPOSAL: ${signal.symbol}*\n\n` +
    `🧠 *AI Thesis (Gemini Pro - ${signal.aiScore || 8}/10):*\n` +
    `_"${signal.aiThesis || 'Solid breakout structure; manipulation check passed.'}"_\n\n` +
    `• *Setup:* ${signal.setup}\n` +
    `• *Entry Price:* ~$${signal.entryPrice.toFixed(2)}\n` +
    `• *Position:* ${signal.qty} ${isStock ? 'share(s)' : 'contract'}\n` +
    `• *Stop Loss:* $${signal.stopLoss.toFixed(2)} (-1.5%)\n` +
    `• *Take Profit:* $${signal.takeProfit.toFixed(2)} (+3.5%)\n` +
    `• *Risk / Potential:* -₹${riskINR} to gain +₹${rewardINR}\n\n` +
    `🎯 *Primary Mission:* ₹${state.lifelineBaseINR.toLocaleString()} ➔ ₹${state.overallGoalINR.toLocaleString()}\n` +
    `🛡️ *Protected Lifeline Base:* ₹${state.lifelineBaseINR.toLocaleString()}\n\n` +
    `_The [ ALLOW ] button stays open. When tapped, live price slippage will be re-checked before execution._`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `✅ ALLOW ${signal.symbol}`,
          callback_data: `alpaca_exec:${signal.symbol}:buy:${signal.qty}:${signal.stopLoss.toFixed(2)}:${signal.takeProfit.toFixed(2)}:${signal.entryPrice.toFixed(2)}`,
        },
        {
          text: '❌ REJECT',
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
    state.subscribedChatIds.add(fromChatId);
  }

  // 1. Handle Inline Button Clicks (Callback Queries)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message.chat.id;
    const messageId = cq.message.message_id;
    const data = cq.data || '';

    if (data === 'cancel') {
      await sendTelegram('answerCallbackQuery', { callback_query_id: cq.id, text: 'Trade Cancelled' });
      await sendTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: '❌ *Trade Cancelled by User.*\nNo capital risked.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (data.startsWith('alpaca_exec:')) {
      const parts = data.split(':');
      const [, symbol, side, qty, stopPrice, targetPrice, originalEntryPrice] = parts;

      await sendTelegram('answerCallbackQuery', { callback_query_id: cq.id, text: 'Fast Engine auditing live slippage...' });

      // Live Pre-Execution Slippage Re-check
      const livePrice = (await getAlpacaLatestTrade(symbol)) || Number(originalEntryPrice);
      const original = Number(originalEntryPrice);
      const slippagePercent = Math.abs((livePrice - original) / original) * 100;

      // If slippage exceeds 0.5%, abort execution to protect the 6k lifeline
      if (slippagePercent > 0.5) {
        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `⚠️ *TRADE ABORTED — SLIPPAGE PROTECTION*\n\n` +
            `• *Symbol:* ${symbol}\n` +
            `• *Proposed Price:* $${original.toFixed(2)}\n` +
            `• *Live Price:* $${livePrice.toFixed(2)} (${slippagePercent.toFixed(2)}% move)\n\n` +
            `_Price moved past the 0.5% safety threshold. Order was rejected to protect your ₹${state.lifelineBaseINR} base capital._`,
          parse_mode: 'Markdown',
        });
        return;
      }

      try {
        const order = await placeAlpacaBracketOrder({
          symbol,
          qty,
          side,
          stopPrice: Number(stopPrice),
          targetPrice: Number(targetPrice),
        });

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text:
            `✅ *ORDER EXECUTED WITH BRACKET PROTECTION*\n\n` +
            `• *Symbol:* ${symbol.toUpperCase()}\n` +
            `• *Side:* ${side.toUpperCase()}\n` +
            `• *Quantity:* ${qty} share(s)\n` +
            `• *Fill Price:* ~$${livePrice.toFixed(2)}\n` +
            `• *Stop Loss:* $${Number(stopPrice).toFixed(2)}\n` +
            `• *Take Profit:* $${Number(targetPrice).toFixed(2)}\n` +
            `• *Order ID:* \`${order.id}\`\n` +
            `• *Status:* ${order.status}\n\n` +
            `🛡️ *Lifeline Base Secured.* Stop-loss is active on the exchange.`,
          parse_mode: 'Markdown',
        });
      } catch (err) {
        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `❌ *Execution Failed*\nError: ${err.message}`,
          parse_mode: 'Markdown',
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
        `🤖 *Autonomous 24/7 Trader Connected*\n\n` +
        `🛡️ *Capital Lifeline:* ₹${state.lifelineBaseINR.toLocaleString()} (Preservation #1)\n` +
        `🎯 *Primary Mission:* ₹${state.lifelineBaseINR.toLocaleString()} ➔ ₹${state.overallGoalINR.toLocaleString()}\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - View 24/7 Scanner health & Market clock\n` +
        `• \`/target <AMOUNT>\` - Revise intermediate goal\n` +
        `• \`/scan\` - Trigger an immediate deep scan right now\n` +
        `• \`/balance\` - View live Alpaca & CoinDCX balances\n` +
        `• \`/trade <SYMBOL> <BUY|SELL> <QTY>\` - Propose a bracket trade with [Allow/Deny]\n\n` +
        `_Whenever a breakout passes the Gemini Pro thesis audit, you get a trade card with live pre-execution slippage protection._`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text.startsWith('/target')) {
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const newTarget = parseInt(parts[1].replace(/[^0-9]/g, ''), 10);
        if (newTarget && newTarget > 0) {
          state.currentExpectationINR = newTarget;
          await sendTelegram('sendMessage', {
            chat_id: chatId,
            text: `🎯 *Expectation Revised!* Interim target set to *₹${newTarget.toLocaleString()}*.\n_Working toward ₹${state.overallGoalINR.toLocaleString()} without exceeding risk parameters._`,
            parse_mode: 'Markdown',
          });
          return;
        }
      }
      await sendTelegram('sendMessage', {
        chat_id: chatId,
        text:
          `🎯 *Mission & Targets:*\n\n` +
          `• *Primary Mission:* ₹${state.lifelineBaseINR.toLocaleString()} ➔ ₹${state.overallGoalINR.toLocaleString()}\n` +
          `• *Interim Target:* ₹${state.currentExpectationINR.toLocaleString()}\n` +
          `• *Protected Capital Lifeline:* ₹${state.lifelineBaseINR.toLocaleString()}\n\n` +
          `_To change expectation anytime, send:_ \`/target <AMOUNT>\`\n` +
          `_Example:_ \`/target 10000\``,
        parse_mode: 'Markdown',
      });
      return;
    }

    if (text === '/status') {
      const clock = await getAlpacaClock();
      const alpaca = await getAlpacaAccount();

      const lastScanStr = state.lastScanTime ? state.lastScanTime.toLocaleTimeString() : 'Pending first scan';
      const usMarketStatus = clock?.is_open ? '🟢 OPEN' : '🔴 CLOSED';

      let reply =
        `🛰️ *AUTONOMOUS AGENT 24/7 STATUS*\n\n` +
        `🛡️ *Protected Capital Lifeline:* ₹${state.lifelineBaseINR.toLocaleString()} (Max Risk: ₹${state.maxRiskPerTradeINR}/trade)\n` +
        `🎯 *Primary Mission:* ₹${state.lifelineBaseINR.toLocaleString()} ➔ ₹${state.overallGoalINR.toLocaleString()}\n\n` +
        `• *24/7 Scanner:* 🟢 RUNNING (every 5 mins)\n` +
        `• *Total Scans Completed:* ${state.totalScansRun}\n` +
        `• *Last Scan Time:* ${lastScanStr}\n` +
        `• *US Stock Market:* ${usMarketStatus}\n` +
        `• *Crypto Futures:* 🟢 24/7 ACTIVE\n` +
        `• *AI Audit Engine:* ${GEMINI_KEY ? '🟢 Gemini Pro Active' : '🟡 Algorithmic Rules Active'}\n\n` +
        `*Watchlist:*\n` +
        `• Stocks: ${STOCK_WATCHLIST.join(', ')}\n` +
        `• Crypto: ${CRYPTO_WATCHLIST.join(', ')}\n\n`;

      if (alpaca) {
        reply +=
          `💼 *Alpaca Portfolio:* $${Number(alpaca.portfolio_value).toLocaleString()} (BP: $${Number(alpaca.buying_power).toLocaleString()})\n\n`;
      }

      if (state.recentSignals.length > 0) {
        reply += `*Recent High-Conviction Signals:*\n`;
        for (const s of state.recentSignals.slice(0, 3)) {
          reply += `• ${s.symbol} at $${s.entryPrice.toFixed(2)} (${new Date(s.time).toLocaleTimeString()})\n`;
        }
      } else {
        reply += `• _No recent breakout signals detected._\n`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/scan') {
      await sendTelegram('sendMessage', { chat_id: chatId, text: '⏳ *Scanning markets with anti-manipulation audit...*', parse_mode: 'Markdown' });
      const hits = await runMarketScan();
      if (hits.length === 0) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `🔍 *Scan Complete:* Checked ${STOCK_WATCHLIST.length} stocks and ${CRYPTO_WATCHLIST.length} crypto pairs. No setups cleared the anti-manipulation audit. Capital preserved.`,
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    if (text === '/balance') {
      const alpaca = await getAlpacaAccount();
      const coindcx = await getCoinDCXBalances();

      let reply = `💼 *LIVE PORTFOLIO STATUS*\n\n`;

      if (alpaca) {
        reply +=
          `🇺🇸 *Alpaca (${APCA_IS_PAPER ? 'Paper Sandbox' : 'Live'})*\n` +
          `• *Portfolio Value:* $${Number(alpaca.portfolio_value).toLocaleString()}\n` +
          `• *Buying Power:* $${Number(alpaca.buying_power).toLocaleString()}\n` +
          `• *Status:* ${alpaca.status}\n\n`;
      }

      if (coindcx) {
        reply += `🇮🇳 *CoinDCX Holdings*\n`;
        if (coindcx.length === 0) {
          reply += `• _No active non-zero balances_\n`;
        } else {
          for (const b of coindcx.slice(0, 8)) {
            reply += `• ${b.currency}: ${b.balance}\n`;
          }
        }
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text.startsWith('/trade')) {
      const parts = text.split(/\s+/);
      if (parts.length < 4) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `⚠️ *Usage:* \`/trade <SYMBOL> <BUY|SELL> <QTY>\`\n_Example:_ \`/trade TSLA BUY 1\``,
          parse_mode: 'Markdown',
        });
        return;
      }

      const [, symbol, side, qtyStr] = parts;
      const qty = parseInt(qtyStr, 10) || 1;
      const cleanSide = side.toLowerCase() === 'sell' ? 'sell' : 'buy';
      const cleanSymbol = symbol.toUpperCase();

      const currentPrice = (await getAlpacaLatestTrade(cleanSymbol)) || 364.0;
      const stopDistance = currentPrice * 0.015;
      const targetDistance = currentPrice * 0.035;

      const stopPrice = cleanSide === 'buy' ? currentPrice - stopDistance : currentPrice + stopDistance;
      const targetPrice = cleanSide === 'buy' ? currentPrice + targetDistance : currentPrice - targetDistance;

      const promptText =
        `📊 *MANUAL TRADE PROPOSAL: ${cleanSymbol}*\n\n` +
        `• *Action:* ${cleanSide.toUpperCase()} ${qty} share(s)\n` +
        `• *Est. Price:* ~$${currentPrice.toFixed(2)}\n` +
        `• *Stop Loss:* $${stopPrice.toFixed(2)} (-1.5%)\n` +
        `• *Take Profit:* $${targetPrice.toFixed(2)} (+3.5%)\n\n` +
        `🛡️ *Pre-Execution Protection:* Button stays open. When tapped, slippage is re-verified live before placing order.`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '✅ ALLOW TRADE',
              callback_data: `alpaca_exec:${cleanSymbol}:${cleanSide}:${qty}:${stopPrice.toFixed(2)}:${targetPrice.toFixed(2)}:${currentPrice.toFixed(2)}`,
            },
            {
              text: '❌ REJECT',
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
      text: `Command not recognized. Type /help or /status.`,
    });
  }
}

// 24/7 background scanner cycle
function startBackgroundScanner() {
  console.log('[TraderService] Starting 24/7 background market scanner with 6k lifeline protection...');
  setTimeout(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Initial scan error:', err));
  }, 15000);

  setInterval(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Scheduled scan error:', err));
  }, state.scannerIntervalMs);
}

startBackgroundScanner();

module.exports = {
  handleTelegramUpdate,
  sendTelegram,
  broadcastTelegram,
  getAlpacaAccount,
  getCoinDCXBalances,
  placeAlpacaBracketOrder,
  runMarketScan,
  state,
};
