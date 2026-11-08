'use strict';

const svc = require('../services/paymentsService');

async function topup(req, res, next) {
  try {
    const platform = req.body?.platform || (req.headers['x-platform'] === 'android' ? 'mobile' : 'web');
    const result = await svc.createTopup({
      user_id: req.user.id,
      amount_paise: req.body?.amount_paise,
      platform,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
}

async function verifyRazorpay(req, res, next) {
  try {
    const result = await svc.verifyRazorpayPayment({
      user_id: req.user.id,
      razorpay_order_id: req.body?.razorpay_order_id,
      razorpay_payment_id: req.body?.razorpay_payment_id,
      razorpay_signature: req.body?.razorpay_signature,
    });
    res.json(result);
  } catch (e) { next(e); }
}

async function getStatus(req, res, next) {
  try {
    const payment = await svc.getPaymentByOrderId({
      user_id: req.user.id,
      gateway_order_id: req.params.order_id,
    });
    res.json({ payment });
  } catch (e) { next(e); }
}

async function listMine(req, res, next) {
  try {
    const result = await svc.listMyPayments({
      user_id: req.user.id,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (e) { next(e); }
}

module.exports = { topup, verifyRazorpay, getStatus, listMine };
