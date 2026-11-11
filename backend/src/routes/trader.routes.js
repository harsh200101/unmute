'use strict';

const express = require('express');
const router = express.Router();
const traderService = require('../services/traderService');

/**
 * Telegram Webhook endpoint.
 * Telegram sends updates (messages, button clicks) here.
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
 * Health check & Bybit Demo scanner status endpoint
 */
router.get('/status', async (_req, res) => {
  try {
    const bybitBalance = await traderService.getBybitWalletBalance();
    const bybitPositions = await traderService.getBybitPositions();
    res.json({
      ok: true,
      service: 'bybit-demo-trader-v2',
      strategy: {
        baseINR: traderService.state.lifelineBaseINR,
        realizedPnlINR: traderService.state.realizedPnlINR,
        targetINR: traderService.state.overallGoalINR,
        wins: traderService.state.totalWins,
        losses: traderService.state.totalLosses,
        breakevens: traderService.state.totalBreakevens,
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
        configured: Boolean(process.env.BYBIT_API_KEY || true),
        status: bybitBalance ? 'connected' : 'disconnected',
        totalEquityUSDT: bybitBalance ? bybitBalance.totalEquity : null,
        availableBalanceUSDT: bybitBalance ? bybitBalance.totalAvailableBalance : null,
        openPositionsCount: bybitPositions ? bybitPositions.length : 0,
      },
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Trigger manual scan via HTTP
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
