'use strict';
const https = require('https');
const crypto = require('crypto');

const BYBIT_KEY = 'k4SXoC5OZgSNSFnt81';
const BYBIT_SECRET = 'WZI894Or0LVBqC7U4ZF6Ocnzv0CrrxpdR5m6';

function bybitRequest(endpoint, method = 'GET', data = '') {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const payload = method === 'GET' ? data : (typeof data === 'string' ? data : JSON.stringify(data));
    const signString = timestamp + BYBIT_KEY + recvWindow + (payload || '');
    const signature = crypto.createHmac('sha256', BYBIT_SECRET).update(signString).digest('hex');
    const path = method === 'GET' && payload ? `${endpoint}?${payload}` : endpoint;
    const req = https.request({
      hostname: 'api-demo.bybit.com',
      port: 443,
      path,
      method,
      headers: {
        'X-BAPI-API-KEY': BYBIT_KEY,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    if (method === 'POST' && payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const ticker = await bybitRequest('/v5/market/tickers', 'GET', 'category=linear&symbol=NVDAUSDT');
  console.log('NVDAUSDT Ticker on Bybit Demo:', JSON.stringify(ticker.result?.list?.[0], null, 2));

  const setLev = await bybitRequest('/v5/position/set-leverage', 'POST', {
    category: 'linear',
    symbol: 'NVDAUSDT',
    buyLeverage: '25',
    sellLeverage: '25',
  });
  console.log('NVDAUSDT Set Leverage on Bybit Demo:', JSON.stringify(setLev));
}
main().catch(console.error);
