'use strict';
const https = require('https');

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  // 1. Check @Traderthinkbot
  const thinkBotToken = '8836965252:AAFqSAHp02FqZnP7KpiQKMDIcbA9-mB3tbI';
  const me = await httpGetJson(`https://api.telegram.org/bot${thinkBotToken}/getMe`);
  console.log('1. @Traderthinkbot getMe:', JSON.stringify(me.data));

  const updates = await httpGetJson(`https://api.telegram.org/bot${thinkBotToken}/getUpdates`);
  console.log('2. @Traderthinkbot getUpdates:', JSON.stringify(updates.data));

  // Also check existing bot updates/chat_id on Render status
  const renderStatus = await httpGetJson('https://unmute-backend-4x1x.onrender.com/api/trader/status');
  console.log('3. Render /api/trader/status:', JSON.stringify({
    marketRegime: renderStatus.data?.marketRegime,
    usEquitiesOpen: renderStatus.data?.usEquitiesOpen,
    bybitPositions: renderStatus.data?.bybit?.positions?.length,
    alpacaStatus: renderStatus.data?.alpaca,
    recentScanCount: renderStatus.data?.recentScans?.length,
    lastScan: renderStatus.data?.recentScans?.[0],
  }, null, 2));

  // 2. Check Bybit Instruments across linear, spot, inverse to see total count & if any US stocks exist on Bybit
  const bybitLinear = await httpGetJson('https://api.bybit.com/v5/market/tickers?category=linear');
  const linearList = bybitLinear.data?.result?.list || [];
  console.log('4. Bybit Total Linear Perpetuals:', linearList.length);

  const stockNames = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOG', 'META', 'AMD', 'NFLX', 'COIN', 'MSTR', 'SPY', 'QQQ', 'PLTR'];
  const bybitStockMatches = linearList.filter(t => stockNames.some(s => t.symbol.includes(s)));
  console.log('5. Bybit Linear Symbols matching stock tickers:', bybitStockMatches.map(x => x.symbol));

  const bybitSpot = await httpGetJson('https://api.bybit.com/v5/market/tickers?category=spot');
  const spotList = bybitSpot.data?.result?.list || [];
  const bybitSpotStockMatches = spotList.filter(t => stockNames.some(s => t.symbol.includes(s)));
  console.log('6. Bybit Total Spot Pairs:', spotList.length, '| Matching stock tickers:', bybitSpotStockMatches.map(x => x.symbol));

  // 3. Test Alpaca US Stock Screener / Snapshots directly
  const apcaKey = 'PKMGD33K2PM6LJVIND6KTOHHAO';
  const apcaSecret = 'DpajVwXqJDFnecku51hJCWS1Z2bUggUhErwDkqomnm4y';
  const apcaHeaders = {
    'APCA-API-KEY-ID': apcaKey,
    'APCA-API-SECRET-KEY': apcaSecret,
  };
  const apcaClock = await httpGetJson('https://paper-api.alpaca.markets/v2/clock', apcaHeaders);
  console.log('7. Alpaca Market Clock:', JSON.stringify(apcaClock.data));

  const apcaActives = await httpGetJson('https://data.alpaca.markets/v1beta1/screener/stocks/most-actives?top=25', apcaHeaders);
  console.log('8. Alpaca Most Actives Screener:', JSON.stringify(apcaActives.data).slice(0, 600));

  const apcaMovers = await httpGetJson('https://data.alpaca.markets/v1beta1/screener/stocks/market-movers?top=20', apcaHeaders);
  console.log('9. Alpaca Market Movers Screener:', JSON.stringify(apcaMovers.data).slice(0, 600));

  const apcaSnap = await httpGetJson('https://data.alpaca.markets/v2/stocks/snapshots?symbols=NVDA,TSLA,AMD,AAPL,META&feed=iex', apcaHeaders);
  console.log('10. Alpaca Snapshots (IEX):', Object.keys(apcaSnap.data || {}), JSON.stringify(apcaSnap.data?.NVDA || {}).slice(0, 400));
}

main().catch(console.error);
