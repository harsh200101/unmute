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
  });
}

async function main() {
  // 1. Inspect Bybit instruments-info for linear to see how Bybit categorizes or names US Stock Perps
  const infoRes = await httpGetJson('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000');
  const instruments = infoRes.data?.result?.list || [];
  console.log('Total Bybit Linear Instruments:', instruments.length);

  // Known US stock / ETF tickers or symbols with STOCK or equity names
  const knownStocks = new Set([
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'BRK', 'LLY', 'AVGO', 'JPM', 'V', 'UNH',
    'XOM', 'MA', 'COST', 'HD', 'PG', 'JNJ', 'NFLX', 'ABBV', 'BAC', 'CRM', 'AMD', 'CVX', 'KO', 'MRK', 'WMT',
    'PEP', 'TMO', 'LIN', 'WFC', 'ADBE', 'CSCO', 'MCD', 'DIS', 'ABT', 'PM', 'INTC', 'QCOM', 'TXN', 'IBM',
    'GE', 'CAT', 'VZ', 'AMGN', 'NOW', 'INTU', 'UBER', 'PFE', 'ISRG', 'GS', 'SPGI', 'BKNG', 'AXP', 'MS',
    'BLK', 'BA', 'T', 'RTX', 'NEE', 'HON', 'UNP', 'LOW', 'SYK', 'CMCSA', 'COP', 'TJX', 'VRTX', 'PGR',
    'SCHW', 'LMT', 'C', 'ETN', 'BSX', 'REGN', 'MU', 'ADP', 'PANW', 'MDLZ', 'PLD', 'ADI', 'CB', 'MMC',
    'DE', 'BMY', 'CI', 'GILD', 'SBUX', 'KLAC', 'LRCX', 'SNPS', 'CDNS', 'AMT', 'FI', 'SO', 'MDT', 'ZTS',
    'PLTR', 'COIN', 'MSTR', 'HOOD', 'SMCI', 'ARM', 'CRWD', 'SNOW', 'DDOG', 'NET', 'SHOP', 'SQ', 'PYPL',
    'ROKU', 'SOFI', 'RIVN', 'LCID', 'NIO', 'BABA', 'JD', 'PDD', 'BIDU', 'TSM', 'ASML', 'NVO', 'SONY',
    'SPY', 'QQQ', 'IWM', 'DIA', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'ARKK', 'GLD', 'SLV', 'TLT', 'XLF', 'XLE'
  ]);

  const bybitStockLinear = [];
  for (const inst of instruments) {
    const base = inst.baseCoin.replace(/STOCK$/i, '');
    if (knownStocks.has(base) || inst.symbol.includes('STOCK') || inst.baseCoin.endsWith('X')) {
      bybitStockLinear.push({
        symbol: inst.symbol,
        baseCoin: inst.baseCoin,
        status: inst.status,
        contractType: inst.contractType,
        maxLeverage: inst.leverageFilter?.maxLeverage,
      });
    }
  }
  console.log('Bybit Linear US Stock/ETF Perpetuals found:', bybitStockLinear.length);
  console.log(JSON.stringify(bybitStockLinear, null, 2));

  // Also check Bybit Demo API for those same symbols!
  const demoTickers = await httpGetJson('https://api-demo.bybit.com/v5/market/tickers?category=linear');
  const demoMap = new Map((demoTickers.data?.result?.list || []).map(t => [t.symbol, t]));
  const availableOnDemo = bybitStockLinear.filter(s => demoMap.has(s.symbol)).map(s => ({
    ...s,
    lastPrice: demoMap.get(s.symbol).lastPrice,
    turnover24h: demoMap.get(s.symbol).turnover24h,
  }));
  console.log('Available on Bybit Demo (api-demo.bybit.com):', availableOnDemo.length);
  console.log(JSON.stringify(availableOnDemo, null, 2));
}

main().catch(console.error);
