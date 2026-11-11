'use strict';
process.env.NODE_ENV = 'test'; // prevent auto-loop during one-shot verification
require('dotenv').config({ path: 'E:/unmute2/backend/.env' });
const traderService = require('E:/unmute2/backend/src/services/traderService');
const { pool } = require('E:/unmute2/backend/src/config/db');

async function main() {
  console.log('1. Testing INTU Compliance Block:');
  console.log('   isStrictlyBlockedSymbol("INTU"):', traderService.isStrictlyBlockedSymbol('INTU'));
  console.log('   isStrictlyBlockedSymbol("INTUUSDT"):', traderService.isStrictlyBlockedSymbol('INTUUSDT'));
  console.log('   isStrictlyBlockedSymbol("Intuit Inc"):', traderService.isStrictlyBlockedSymbol('XYZ', 'Intuit Inc'));

  await traderService.refreshBybitInstrumentUniverse();
  console.log('2. Universe Loaded:');
  console.log('   Bybit US Stock Perps:', traderService.state.bybitStockUniverse.size);
  console.log('   Bybit Crypto Perps:', traderService.state.bybitCryptoUniverse.size);
  console.log('   Has INTUUSDT in Bybit Stock Universe?:', traderService.state.bybitStockUniverse.has('INTUUSDT'));

  // Load subscribers so Telegram gets the live scan & thinking stream
  const subRes = await pool.query('SELECT chat_id FROM trader_subscribers');
  for (const r of subRes.rows) {
    if (String(r.chat_id) !== '999999') {
      traderService.state.subscribedChatIds.add(String(r.chat_id));
      traderService.state.thinkSubscribedChatIds.add(String(r.chat_id));
    }
  }

  console.log('3. Running Live US-Stock-Prioritized Scan...');
  const hits = await traderService.runMarketScan(true);
  console.log('4. Qualifying Hits:', JSON.stringify(hits.map(h => ({
    market: h.market,
    symbol: h.symbol,
    action: h.action,
    aiScore: h.aiScore,
    aiThesis: h.aiThesis,
    autoExecuted: Boolean(h.autoExecutedOrder),
    orderId: h.autoExecutedOrder?.id,
  })), null, 2));

  if (traderService.state.recentThoughts[0]) {
    console.log('\n5. Latest Chain-of-Thought Trace:\n', traderService.state.recentThoughts[0].thoughtProcess.slice(0, 1200));
  }

  console.log('\n6. Testing Pause / Resume Control:');
  await traderService.setDeskPauseState(true, 'Test verification');
  console.log('   Desk isPaused (should be true):', traderService.state.isPaused);
  await traderService.setDeskPauseState(false, 'Test verification unpause');
  console.log('   Desk isPaused (should be false):', traderService.state.isPaused);

  await pool.end();
}
main().catch(console.error);
