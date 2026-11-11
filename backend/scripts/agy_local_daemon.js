'use strict';

/**
 * ============================================================================
 * AGY LOCAL MASTER BRAIN & LIVE THINKING TERMINAL (`agy_local_daemon.js`)
 * ============================================================================
 *
 * How This Works:
 * 1. AUTOMATIC STARTUP WHEN LAPTOP OPENS:
 *    Launched automatically by Windows Startup (`AGY-Autonomous-Trader-Startup.cmd`).
 *    Every 30 seconds, sends a `LOCAL_AGY` lease heartbeat to PostgreSQL & Render
 *    (`POST /api/trader/coordination/heartbeat`). Render sees `LOCAL_AGY` is active
 *    and immediately yields its cloud scanner to your laptop.
 *
 * 2. FULL-UNIVERSE US STOCK PRIORITY & LIVE THINKING:
 *    Scans 293 Bybit 25x US Stock Perpetuals + 40 Alpaca US Stocks + 568 Bybit Crypto Perps
 *    (strictly blocking INTU / Intuit), prioritizes US Stocks when the US market is open,
 *    prints the full word-for-word Chain-of-Thought reasoning in this console, AND
 *    streams it live to @Traderthinkbot on Telegram!
 *
 * 3. AUTOMATIC FAILOVER WHEN LAPTOP SLEEPS:
 *    - If you press Ctrl+C or close the window, it hands control back to Render Cloud.
 *    - If you close your laptop lid, Render detects the missed heartbeat after 90s
 *      and seamlessly resumes 24/7 scanning.
 */

process.env.IS_LOCAL_DAEMON = 'true';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const traderService = require('../src/services/traderService');

const RENDER_URL = process.env.RENDER_BACKEND_URL || 'https://unmute-backend-4x1x.onrender.com';
const AGENT_ID = `laptop-agy-${process.env.COMPUTERNAME || 'master'}`;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

let lastPrintedThoughtTime = null;

async function sendRemoteHeartbeat(mode = 'LOCAL_AGY') {
  try {
    await fetch(`${RENDER_URL}/api/trader/coordination/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, agentId: AGENT_ID }),
    });
  } catch (err) {
    // Shared PostgreSQL update below still coordinates state
  }
  await traderService.updateHeartbeat(mode, AGENT_ID);
}

async function printLatestScanThinking() {
  const latest = traderService.state.recentThoughts[0];
  if (!latest || latest.timestamp === lastPrintedThoughtTime) return;
  lastPrintedThoughtTime = latest.timestamp;

  const timestamp = new Date(latest.timestamp).toLocaleTimeString();
  console.log(`\n${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(
    `${C.bold}${C.cyan}⚡ [${timestamp}] SCAN #${latest.scanNumber} | BIAS: ${latest.activeBias} | MODEL: ${latest.model} (${latest.thoughtsTokens} thought tokens)${C.reset}`
  );
  console.log(
    `${C.green}🌐 Universe:${C.reset} ${traderService.state.bybitStockUniverse.size || 293} Bybit US Stock Perps + 40 Alpaca US Stocks + ${
      traderService.state.bybitCryptoUniverse.size || 568
    } Crypto Perps (INTU Blocked)`
  );
  console.log(`${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`\n${C.magenta}${C.bold}🧠 [AGY / GEMINI CHAIN-OF-THOUGHT STREAM (Also sent to @Traderthinkbot)]:${C.reset}`);
  console.log(`${C.gray}${latest.thoughtProcess}${C.reset}`);

  if (Array.isArray(latest.decisions) && latest.decisions.length > 0) {
    console.log(`\n${C.yellow}${C.bold}🎯 [AUDIT DECISIONS]:${C.reset}`);
    for (const d of latest.decisions) {
      console.log(`  • [${d.market.toUpperCase()}] ${d.symbol} (${d.action.toUpperCase()}) -> Score ${d.score}/10: ${d.thesis}`);
    }
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n${C.yellow}[LocalDaemon] Received ${signal}. Handing off control to RENDER_CLOUD 24/7 worker...${C.reset}`);
  try {
    await fetch(`${RENDER_URL}/api/trader/coordination/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetMode: 'RENDER_CLOUD', agentId: `${AGENT_ID}-sleep` }),
    });
    await traderService.handoffControl('RENDER_CLOUD', `${AGENT_ID}-sleep`);
    console.log(`${C.green}[LocalDaemon] Handoff complete! Render Cloud is now the active 24/7 master.${C.reset}`);
  } catch (err) {
    console.warn('[LocalDaemon] Handoff warning (Render will auto-reclaim in <90s):', err.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  console.log(`${C.bold}${C.green}============================================================================${C.reset}`);
  console.log(`${C.bold}${C.green} 🚀 LOCAL AGY HYBRID MASTER BRAIN STARTED (${AGENT_ID})${C.reset}`);
  console.log(`${C.green} • Claimed LOCAL_AGY lease -> Render Cloud has paused its scanner${C.reset}`);
  console.log(`${C.green} • Universe: 293 Bybit 25x US Stock Perps + 40 Alpaca US Stocks + 568 Crypto Perps${C.reset}`);
  console.log(`${C.green} • Strict Compliance Ban: INTU / Intuit 100% Blocked${C.reset}`);
  console.log(`${C.green} • Live Thinking Stream mirrored to @Traderthinkbot on Telegram${C.reset}`);
  console.log(`${C.bold}${C.green}============================================================================${C.reset}`);

  await sendRemoteHeartbeat('LOCAL_AGY');

  setInterval(() => sendRemoteHeartbeat('LOCAL_AGY'), 30 * 1000);
  setInterval(() => printLatestScanThinking(), 3 * 1000);
})();
