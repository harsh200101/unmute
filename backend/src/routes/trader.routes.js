'use strict';

const express = require('express');
const router = express.Router();
const traderService = require('../services/traderService');

/**
 * Telegram Webhook endpoint.
 * Telegram sends updates (messages, button clicks) here.
 */
router.post('/webhook', async (req, res) => {
  // Acknowledge Telegram immediately with 200 OK
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
 * Health check & diagnostic endpoint
 */
router.get('/status', async (_req, res) => {
  try {
    const alpaca = await traderService.getAlpacaAccount();
    res.json({
      ok: true,
      service: 'trader-bot-v1',
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      alpacaStatus: alpaca ? alpaca.status : 'disconnected',
      alpacaBuyingPower: alpaca ? alpaca.buying_power : null,
      coindcxConfigured: Boolean(process.env.COINDCX_API_KEY),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
