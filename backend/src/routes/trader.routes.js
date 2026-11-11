'use strict';

const express = require('express');
const router = express.Router();
const traderService = require('../services/traderService');

/**
 * Telegram Webhook endpoint (@Harshtradetbot).
 */
router.post('/webhook', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    if (req.body) {
      await traderService.handleTelegramUpdate(req.body);
    }
  } catch (err) {
    console.error('[TraderRoute] Error processing webhook:', err);
  }
});

/**
 * Dedicated Thinking Bot Webhook endpoint (@Traderthinkbot).
 */
router.post('/think-webhook', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    if (req.body) {
      await traderService.handleThinkTelegramUpdate(req.body);
    }
  } catch (err) {
    console.error('[TraderRoute] Error processing think-webhook:', err);
  }
});

/**
 * Live Chain-of-Thought History & Operator Directives endpoint
 */
router.get('/thoughts', async (_req, res) => {
  try {
    const coordination = await traderService.getCoordinationState();
    res.json({
      ok: true,
      activeMode: coordination.activeMode,
      activeAgentId: coordination.activeAgentId,
      activeBias: traderService.state.macroRegime.activeBias,
      operatorDirectives: traderService.state.operatorDirectives,
      thoughts: traderService.state.recentThoughts,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Health check & Dual-Market (Bybit 24/7 Crypto + Alpaca 14 US Stocks) status endpoint
 */
router.get('/status', async (_req, res) => {
  try {
    const [bybitBalance, bybitPositions, alpacaClock, alpacaAccount, alpacaPositions, coordination] =
      await Promise.all([
        traderService.getBybitWalletBalance(),
        traderService.getBybitPositions(),
        traderService.getAlpacaClock(),
        traderService.getAlpacaAccount(),
        traderService.getAlpacaPositions(),
        traderService.getCoordinationState(),
      ]);

    res.json({
      ok: true,
      service: 'dual-market-autonomous-trader-v3',
      strategy: {
        baseINR: traderService.state.lifelineBaseINR,
        realizedPnlINR: traderService.state.realizedPnlINR,
        targetINR: traderService.state.overallGoalINR,
        paperSliceUSD: traderService.state.paperSliceUSD,
        autoExecuteTrades: traderService.state.autoExecuteTrades,
        wins: traderService.state.totalWins,
        losses: traderService.state.totalLosses,
        breakevens: traderService.state.totalBreakevens,
      },
      macroRegime: traderService.state.macroRegime,
      universe: {
        bybitUSStockPerpsCount: traderService.state.bybitStockUniverse.size || 293,
        bybitCryptoPerpsCount: traderService.state.bybitCryptoUniverse.size || 568,
        alpacaUSStocksCount: 40,
        strictlyBlockedCompliance: ['INTU', 'INTUUSDT', 'INTUIT'],
      },
      operatorDirectives: traderService.state.operatorDirectives,
      coordination,
      geminiPool: {
        activeKeysCount: traderService.GEMINI_KEYS.length,
        models: traderService.GEMINI_MODEL_BUCKETS,
        lastModelUsed: traderService.rateLimiter.lastModelUsed,
        lastThoughtsTokens: traderService.rateLimiter.lastThoughtsTokens,
        requestsThisMinute: traderService.rateLimiter.requestsThisMinute,
        requestsToday: traderService.rateLimiter.requestsToday,
      },
      scanner: {
        active: true,
        intervalSeconds: Math.round(traderService.state.scannerIntervalMs / 1000),
        monitorSeconds: Math.round(traderService.state.monitorIntervalMs / 1000),
        totalScansRun: traderService.state.totalScansRun,
        lastScanTime: traderService.state.lastScanTime,
        subscribedUsers: traderService.state.subscribedChatIds.size,
        recentSignalsCount: traderService.state.recentSignals.length,
      },
      bybit: {
        configured: true,
        status: bybitBalance ? 'connected' : 'disconnected',
        totalEquityUSDT: bybitBalance ? bybitBalance.totalEquity : null,
        availableBalanceUSDT: bybitBalance ? bybitBalance.totalAvailableBalance : null,
        openPositionsCount: bybitPositions ? bybitPositions.length : 0,
      },
      alpaca: {
        configured: true,
        status: alpacaAccount ? 'connected' : 'disconnected',
        marketOpen: Boolean(alpacaClock && alpacaClock.is_open),
        equityUSD: alpacaAccount ? Number(alpacaAccount.equity) : null,
        buyingPowerUSD: alpacaAccount ? Number(alpacaAccount.buying_power) : null,
        openPositionsCount: alpacaPositions ? alpacaPositions.length : 0,
      },
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN || true),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Trigger manual Dual-Market scan via HTTP
 */
router.post('/scan', async (_req, res) => {
  try {
    const hits = await traderService.runMarketScan(true);
    res.json({ ok: true, hitsFound: hits.length, hits });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Hybrid Laptop (LOCAL_AGY) <-> Render Cloud (RENDER_CLOUD) Heartbeat Endpoint
 */
router.post('/coordination/heartbeat', async (req, res) => {
  try {
    const mode = req.body?.mode || 'LOCAL_AGY';
    const agentId = req.body?.agentId || 'laptop-agy';
    const coord = await traderService.updateHeartbeat(mode, agentId);
    res.json({ ok: true, coordination: coord });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Explicit Handoff Endpoint (when Laptop is going to sleep or waking up)
 */
router.post('/coordination/handoff', async (req, res) => {
  try {
    const targetMode = req.body?.targetMode || 'RENDER_CLOUD';
    const agentId = req.body?.agentId || 'laptop-shutdown-handoff';
    const coord = await traderService.handoffControl(targetMode, agentId);
    res.json({ ok: true, message: `Control handed off to ${targetMode}`, coordination: coord });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Clear/Reset journal stats and phantom balance
 */
router.post('/reset-journal', async (_req, res) => {
  try {
    const result = await traderService.resetJournalAndBalance();
    res.json({ ok: true, message: 'Trader journal and balance reset successfully', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
