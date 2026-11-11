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
  const nvda = await httpGetJson('https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=NVDAUSDT');
  const btc = await httpGetJson('https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=BTCUSDT');
  const amd = await httpGetJson('https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=AMDSTOCKUSDT');
  const intu = await httpGetJson('https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=INTUUSDT');
  console.log('NVDAUSDT instrument:', JSON.stringify(nvda.result.list[0], null, 2));
  console.log('BTCUSDT instrument:', JSON.stringify(btc.result.list[0], null, 2));
  console.log('AMDSTOCKUSDT instrument:', JSON.stringify(amd.result.list[0], null, 2));
  console.log('INTUUSDT instrument:', JSON.stringify(intu.result.list[0], null, 2));
}
main().catch(console.error);
