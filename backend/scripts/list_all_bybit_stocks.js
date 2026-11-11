'use strict';
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
  let cursor = '';
  const allInstruments = [];
  do {
    const url = `https://api-demo.bybit.com/v5/market/instruments-info?category=linear&limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
    const res = await httpGetJson(url);
    const list = res.result?.list || [];
    allInstruments.push(...list);
    cursor = res.result?.nextPageCursor || '';
  } while (cursor);

  const stockPerps = allInstruments.filter(x => x.symbolType === 'stock' || x.marketRegion === 'US');
  const cryptoPerps = allInstruments.filter(x => x.symbolType !== 'stock' && x.marketRegion !== 'US' && x.quoteCoin === 'USDT' && x.status === 'Trading');

  console.log(`Total Linear Instruments on Bybit Demo: ${allInstruments.length}`);
  console.log(`Total US Stock Perpetuals on Bybit (symbolType='stock'): ${stockPerps.length}`);
  console.log(`Total Crypto USDT Perpetuals on Bybit: ${cryptoPerps.length}`);
  console.log('\nAll Bybit US Stock Perpetuals:');
  stockPerps.forEach((s, i) => {
    console.log(`${i + 1}. ${s.symbol} (${s.underlyingTicker} - ${s.fullName}) | MaxLev: ${s.leverageFilter?.maxLeverage}x | Status: ${s.status}`);
  });
}
main().catch(console.error);
