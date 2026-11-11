'use strict';

/**
 * Hybrid Laptop Master Daemon (LOCAL_AGY <-> RENDER_CLOUD)
 *
 * When running on your laptop:
 * 1. Claims 'LOCAL_AGY' master role via heartbeat every 30s so Render yields scanning.
 * 2. Runs the Dual-Market (Bybit 24/7 Crypto + Alpaca 14 US Stocks) scanner locally with zero prompts.
 * 3. When you press Ctrl+C or close the terminal/laptop, automatically hands control back to
 *    Render ('RENDER_CLOUD') immediately (or Render auto-reclaims within 90s of sleep).
 *
 * Run with:
 *   node E:\unmute2\backend\scripts\agy_local_daemon.js
 */

process.env.IS_LOCAL_DAEMON = 'true';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const traderService = require('../src/services/traderService');

const RENDER_URL = process.env.RENDER_BACKEND_URL || 'https://unmute-backend-4x1x.onrender.com';
const AGENT_ID = `laptop-agy-${process.env.COMPUTERNAME || 'win'}`;

async function sendRemoteHeartbeat(mode = 'LOCAL_AGY') {
  try {
    await fetch(`${RENDER_URL}/api/trader/coordination/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, agentId: AGENT_ID }),
    });
  } catch (err) {
    // Local DB update via traderService.updateHeartbeat still succeeds if shared DB
  }
  await traderService.updateHeartbeat(mode, AGENT_ID);
}

async function gracefulShutdown(signal) {
  console.log(`\n[LocalDaemon] Received ${signal}. Handing off control to RENDER_CLOUD 24/7 worker...`);
  try {
    await fetch(`${RENDER_URL}/api/trader/coordination/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetMode: 'RENDER_CLOUD', agentId: `${AGENT_ID}-sleep` }),
    });
    await traderService.handoffControl('RENDER_CLOUD', `${AGENT_ID}-sleep`);
    console.log('[LocalDaemon] Handoff complete! Render Cloud is now the active 24/7 master.');
  } catch (err) {
    console.warn('[LocalDaemon] Handoff warning (Render will auto-reclaim in <90s):', err.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  console.log('====================================================================');
  console.log(` 🚀 STARTING LOCAL HYBRID MASTER DAEMON (${AGENT_ID})`);
  console.log(' • Claiming LOCAL_AGY lease (Render Cloud will stand by)');
  console.log(' • If laptop sleeps, Render Cloud auto-resumes within 90 seconds!');
  console.log('====================================================================');

  await sendRemoteHeartbeat('LOCAL_AGY');
  setInterval(() => sendRemoteHeartbeat('LOCAL_AGY'), 30 * 1000);
})();
