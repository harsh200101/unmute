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

// State management
const state = {
  subscribedChatIds: new Set(),
  scannerIntervalMs: 5 * 60 * 1000, // Every 5 minutes
  lastScanTime: null,
  totalScansRun: 0,
  recentSignals: [],
  alertCooldowns: new Map(), // symbol -> timestamp
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
 * Scan for Day-Trader-Skill setups:
 * 1. US Stocks: Opening Range Breakout (ORB) / 20-bar High Momentum
 * 2. Crypto: 15m Donchian Channel Breakout (24/7)
 */
async function runMarketScan() {
  state.lastScanTime = new Date();
  state.totalScansRun += 1;
  const now = Date.now();
  const hits = [];

  // 1. Scan US Stocks if market is open
  const clock = await getAlpacaClock();
  const isMarketOpen = clock ? clock.is_open : false;

  if (isMarketOpen) {
    for (const sym of STOCK_WATCHLIST) {
      const lastAlert = state.alertCooldowns.get(sym) || 0;
      if (now - lastAlert < 60 * 60 * 1000) continue; // 1-hour cooldown per symbol

      const bars = await getStockBars(sym, 15);
      if (bars.length < 8) continue;

      const latestBar = bars[bars.length - 1];
      const prevBars = bars.slice(0, -1);
      const prevHighs = prevBars.map((b) => b.h);
      const maxPrevHigh = Math.max(...prevHighs);

      // Breakout Rule: Latest bar closes above previous high with positive candle
      if (latestBar.c > maxPrevHigh && latestBar.c > latestBar.o) {
        const entryPrice = latestBar.c;
        const stopLoss = entryPrice * 0.982; // 1.8% stop
        const takeProfit = entryPrice * 1.036; // 3.6% target (2R)

        // Sizing: default whole shares to ~$500-$1000 position
        const qty = Math.max(1, Math.floor(750 / entryPrice));

        const signal = {
          market: 'stock',
          symbol: sym,
          action: 'buy',
          entryPrice,
          stopLoss,
          takeProfit,
          qty,
          time: new Date(),
          setup: '5m Momentum Breakout (ORB)',
        };

        hits.push(signal);
        state.alertCooldowns.set(sym, now);
        state.recentSignals.unshift(signal);
        if (state.recentSignals.length > 20) state.recentSignals.pop();

        // Push alert to Telegram
        await notifyTradeOpportunity(signal);
      }
    }
  }

  // 2. Scan Crypto Futures (Runs 24/7)
  for (const pair of CRYPTO_WATCHLIST) {
    const lastAlert = state.alertCooldowns.get(pair) || 0;
    if (now - lastAlert < 60 * 60 * 1000) continue;

    const candles = await getCoinDCXCandles(pair, 15);
    if (!candles || candles.length < 8) continue;

    // CoinDCX candles: [{ open, high, low, close, volume, time }, ...]
    const latest = candles[0]; // Recent candle
    const prevCandles = candles.slice(1);
    const maxPrevHigh = Math.max(...prevCandles.map((c) => Number(c.high)));

    if (Number(latest.close) > maxPrevHigh && Number(latest.close) > Number(latest.open)) {
      const entryPrice = Number(latest.close);
      const stopLoss = entryPrice * 0.98;
      const takeProfit = entryPrice * 1.04;

      const signal = {
        market: 'crypto',
        symbol: pair,
        action: 'buy',
        entryPrice,
        stopLoss,
        takeProfit,
        qty: 1,
        time: new Date(),
        setup: '15m High Donchian Breakout',
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
  const riskAmount = ((signal.entryPrice - signal.stopLoss) * signal.qty).toFixed(2);
  const rewardAmount = ((signal.takeProfit - signal.entryPrice) * signal.qty).toFixed(2);

  const card =
    `🚨 *DAY-TRADER SIGNAL DETECTED*\n\n` +
    `• *Symbol:* ${signal.symbol}\n` +
    `• *Setup:* ${signal.setup}\n` +
    `• *Entry Price:* ~$${signal.entryPrice.toFixed(2)}\n` +
    `• *Position Size:* ${signal.qty} ${isStock ? 'share(s)' : 'contract'}\n` +
    `• *Stop Loss:* $${signal.stopLoss.toFixed(2)} (-1.8%)\n` +
    `• *Take Profit:* $${signal.takeProfit.toFixed(2)} (+3.6%)\n` +
    `• *Risk / Reward:* $${riskAmount} to gain $${rewardAmount} (1:2 R)\n\n` +
    `_Tap ALLOW to execute this trade on your broker._`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `✅ ALLOW ${signal.symbol}`,
          callback_data: `alpaca_exec:${signal.symbol}:buy:${signal.qty}:${signal.stopLoss.toFixed(2)}:${signal.takeProfit.toFixed(2)}`,
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
  // Capture chatId from any message or button click
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
        text: '❌ *Trade Cancelled by User.*\nNo order was placed.',
        parse_mode: 'Markdown',
      });
      return;
    }

    if (data.startsWith('alpaca_exec:')) {
      const parts = data.split(':');
      const [, symbol, side, qty, stopPrice, targetPrice] = parts;

      await sendTelegram('answerCallbackQuery', { callback_query_id: cq.id, text: 'Submitting Order...' });

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
            `✅ *ORDER SUBMITTED ON ALPACA*\n\n` +
            `• *Symbol:* ${symbol.toUpperCase()}\n` +
            `• *Side:* ${side.toUpperCase()}\n` +
            `• *Quantity:* ${qty} share(s)\n` +
            `• *Stop Loss:* $${Number(stopPrice).toFixed(2)}\n` +
            `• *Take Profit:* $${Number(targetPrice).toFixed(2)}\n` +
            `• *Order ID:* \`${order.id}\`\n` +
            `• *Status:* ${order.status}`,
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
        `🤖 *TraderBot Mobile Terminal Active*\n\n` +
        `This bot runs 24/7 on your Render server to scan setups and ask for your approval.\n\n` +
        `*Commands:*\n` +
        `• \`/status\` - View 24/7 Scanner health & Market clock\n` +
        `• \`/scan\` - Trigger an immediate manual scan right now\n` +
        `• \`/balance\` - View live Alpaca ($100k) & CoinDCX balances\n` +
        `• \`/trade <SYMBOL> <BUY|SELL> <QTY>\` - Propose a bracket trade with [Allow/Deny]\n\n` +
        `_Whenever a breakout triggers, you will receive an alert with [ ALLOW ] and [ REJECT ] buttons._`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/status') {
      const clock = await getAlpacaClock();
      const alpaca = await getAlpacaAccount();

      const lastScanStr = state.lastScanTime ? state.lastScanTime.toLocaleTimeString() : 'Pending first scan';
      const usMarketStatus = clock?.is_open ? '🟢 OPEN' : '🔴 CLOSED';

      let reply =
        `🛰️ *24/7 SCANNER & SYSTEM STATUS*\n\n` +
        `• *Background Scanner:* 🟢 RUNNING (every 5 mins)\n` +
        `• *Total Scans Completed:* ${state.totalScansRun}\n` +
        `• *Last Scan Time:* ${lastScanStr}\n` +
        `• *US Stock Market:* ${usMarketStatus}\n` +
        `• *Crypto Futures:* 🟢 24/7 ACTIVE\n\n` +
        `*Active Watchlist:*\n` +
        `• Stocks: ${STOCK_WATCHLIST.join(', ')}\n` +
        `• Crypto: ${CRYPTO_WATCHLIST.join(', ')}\n\n`;

      if (alpaca) {
        reply +=
          `💼 *Alpaca Paper Account:*\n` +
          `• *Portfolio Value:* $${Number(alpaca.portfolio_value).toLocaleString()}\n` +
          `• *Buying Power:* $${Number(alpaca.buying_power).toLocaleString()}\n\n`;
      }

      if (state.recentSignals.length > 0) {
        reply += `*Recent Signals Detected:*\n`;
        for (const s of state.recentSignals.slice(0, 3)) {
          reply += `• ${s.symbol} at $${s.entryPrice.toFixed(2)} (${new Date(s.time).toLocaleTimeString()})\n`;
        }
      } else {
        reply += `• _No active breakouts in the last cycle._\n`;
      }

      await sendTelegram('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/scan') {
      await sendTelegram('sendMessage', { chat_id: chatId, text: '⏳ *Scanning markets right now...*', parse_mode: 'Markdown' });
      const hits = await runMarketScan();
      if (hits.length === 0) {
        await sendTelegram('sendMessage', {
          chat_id: chatId,
          text: `🔍 *Scan Complete:* Checked ${STOCK_WATCHLIST.length} stocks and ${CRYPTO_WATCHLIST.length} crypto pairs. No new breakouts found at this candle.`,
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
      } else {
        reply += `🇺🇸 *Alpaca:* Connection unavailable\n\n`;
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
      } else {
        reply += `🇮🇳 *CoinDCX:* Connection unavailable\n`;
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
      const stopDistance = currentPrice * 0.02;
      const targetDistance = currentPrice * 0.035;

      const stopPrice = cleanSide === 'buy' ? currentPrice - stopDistance : currentPrice + stopDistance;
      const targetPrice = cleanSide === 'buy' ? currentPrice + targetDistance : currentPrice - targetDistance;
      const maxRisk = (stopDistance * qty).toFixed(2);

      const promptText =
        `📊 *TRADE PROPOSAL: ${cleanSymbol}*\n\n` +
        `• *Action:* ${cleanSide.toUpperCase()} ${qty} share(s)\n` +
        `• *Est. Price:* ~$${currentPrice.toFixed(2)}\n` +
        `• *Stop Loss:* $${stopPrice.toFixed(2)} (-2.0%)\n` +
        `• *Take Profit:* $${targetPrice.toFixed(2)} (+3.5%)\n` +
        `• *Max Dollar Risk:* $${maxRisk}\n\n` +
        `⚠️ *Human-in-the-loop Gate:*\n` +
        `Tap [ ALLOW ] on your phone to submit this bracket order.`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '✅ ALLOW TRADE',
              callback_data: `alpaca_exec:${cleanSymbol}:${cleanSide}:${qty}:${stopPrice.toFixed(2)}:${targetPrice.toFixed(2)}`,
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

// Start the 24/7 background scanner loop (runs every 5 minutes)
function startBackgroundScanner() {
  console.log('[TraderService] Starting 24/7 background market scanner (5m cycle)...');
  // Initial run after 15 seconds to allow boot
  setTimeout(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Initial scan error:', err));
  }, 15000);

  setInterval(() => {
    runMarketScan().catch((err) => console.error('[TraderService] Scheduled scan error:', err));
  }, state.scannerIntervalMs);
}

// Auto-start on module load
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
