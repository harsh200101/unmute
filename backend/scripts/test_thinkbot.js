'use strict';
require('dotenv').config({ path: 'E:/unmute2/backend/.env' });
const { pool } = require('E:/unmute2/backend/src/config/db');
const https = require('https');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const subs = await pool.query('SELECT * FROM trader_subscribers');
  console.log('Subscribers in DB:', subs.rows);

  const thinkToken = '8836965252:AAFqSAHp02FqZnP7KpiQKMDIcbA9-mB3tbI';
  const updates = await httpGetJson(`https://api.telegram.org/bot${thinkToken}/getUpdates`);
  console.log('@Traderthinkbot updates:', JSON.stringify(updates));

  for (const row of subs.rows) {
    const chatId = row.chat_id;
    const sendRes = await fetch(`https://api.telegram.org/bot${thinkToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🧠 *AGY Trader Thinking Bot (@Traderthinkbot) Connected!*\n\nEvery Chain-of-Thought reasoning trace, US Stock priority scan, and interactive reply is now live on this channel. Reply with any instruction here to direct the agent!',
        parse_mode: 'Markdown',
      }),
    }).then(r => r.json());
    console.log(`Test send to ${chatId} on @Traderthinkbot:`, JSON.stringify(sendRes));
  }

  await pool.end();
}
main().catch(console.error);
