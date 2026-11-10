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

async function handleTelegramUpdate(update) {
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

      await sendTelegram('answerCallbackQuery', { callback_query_id: cq.id, text: 'Executing Order...' });

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
          text: `✅ *ORDER EXECUTED ON ALPACA*\n\n` +
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
        `🤖 *TraderBot Mobile Terminal Connected*\n\n` +
        `This bot is hosted on Render 24/7 and wired to your Alpaca & CoinDCX accounts.\n\n` +
        `*Commands:*\n` +
        `• \`/balance\` - View live Alpaca & CoinDCX balances\n` +
        `• \`/trade <SYMBOL> <BUY|SELL> <QTY>\` - Propose a bracket trade with mobile [Allow/Deny]\n` +
        `  _Example:_ \`/trade TSLA BUY 1\`\n` +
        `• \`/help\` - Show this help menu\n\n` +
        `_Note: Every trade requires your explicit [ ALLOW ] tap. Nothing trades autonomously._`;
      await sendTelegram('sendMessage', { chat_id: chatId, text: welcome, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/balance') {
      const alpaca = await getAlpacaAccount();
      const coindcx = await getCoinDCXBalances();

      let reply = `💼 *LIVE PORTFOLIO STATUS*\n\n`;

      if (alpaca) {
        reply += `🇺🇸 *Alpaca (${APCA_IS_PAPER ? 'Paper Sandbox' : 'Live'})*\n` +
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

      // Estimate price or fetch latest
      const currentPrice = (await getAlpacaLatestTrade(cleanSymbol)) || 364.0;
      const stopDistance = currentPrice * 0.02; // 2% protective stop
      const targetDistance = currentPrice * 0.035; // 3.5% take profit

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

    // Default response for unrecognised commands
    await sendTelegram('sendMessage', {
      chat_id: chatId,
      text: `Command not recognized. Type /help to see available commands.`,
    });
  }
}

module.exports = {
  handleTelegramUpdate,
  sendTelegram,
  getAlpacaAccount,
  getCoinDCXBalances,
  placeAlpacaBracketOrder,
};
