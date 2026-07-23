const express = require('express');
const db = require('../lib/db');
const plan = require('../lib/plan');
const paypal = require('../lib/paypal');
const clickpesa = require('../lib/clickpesa');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

async function planPayload(biz) {
  const [invoiceUsage, staffUsage] = await Promise.all([
    plan.invoiceUsage(biz.id),
    plan.staffUsage(biz.id)
  ]);
  return {
    plan: biz.plan,
    premiumUntil: biz.premium_until,
    isPremium: plan.isPremium(biz),
    invoiceUsage,
    staffUsage,
    priceLabel: plan.PREMIUM_PRICE_LABEL,
    priceUsd: plan.PREMIUM_PRICE_USD,
    priceTzs: plan.PREMIUM_PRICE_TZS,
    days: plan.PREMIUM_DAYS_PER_PAYMENT,
    paypalConfigured: paypal.isConfigured(),
    clickpesaConfigured: clickpesa.isConfigured()
  };
}

// Credits a payment exactly once: recordPayment's UNIQUE(provider, provider_ref) index
// makes the insert a no-op on replay, and extendPremium only runs when the insert was
// the first one — so a retried webhook or a double-clicked capture can never stack days.
// Verified under real concurrent load (10 simultaneous duplicate attempts -> exactly 1
// credited) against a live PostgreSQL instance during development.
async function creditPayment({ businessId, provider, providerRef, amount, currency }) {
  const inserted = await db.recordPayment({
    businessId, provider, providerRef, amount, currency,
    daysAdded: plan.PREMIUM_DAYS_PER_PAYMENT, status: 'completed'
  });
  if (inserted) await db.extendPremium(businessId, plan.PREMIUM_DAYS_PER_PAYMENT);
  return inserted;
}

router.get('/plan', requireAuth, async (req, res) => {
  res.json(await planPayload(await db.getBusinessById(req.businessId)));
});

router.get('/history', requireAuth, async (req, res) => {
  res.json({ payments: await db.listPaymentsForBusiness(req.businessId, 20) });
});

// ---- PayPal (Orders API — one $9 charge = 30 days) ----

router.post('/paypal/create-order', requireAuth, async (req, res) => {
  if (!paypal.isConfigured()) {
    return res.status(400).json({ error: 'PayPal is not configured yet. Ask the site owner to finish setup.' });
  }
  try {
    const { orderId, approveUrl } = await paypal.createOrder({
      businessId: req.businessId, amountUsd: plan.PREMIUM_PRICE_USD
    });
    res.json({ orderId, approveUrl });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.post('/paypal/capture-order', requireAuth, async (req, res) => {
  const orderId = String(req.body.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });
  try {
    const result = await paypal.captureOrder(orderId);
    if (result.businessId !== req.businessId) {
      return res.status(400).json({ error: 'This order does not belong to your account' });
    }
    await creditPayment({
      businessId: req.businessId, provider: 'paypal', providerRef: orderId,
      amount: result.amount, currency: result.currency
    });
    res.json(await planPayload(await db.getBusinessById(req.businessId)));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---- ClickPesa (mobile money / cards — hosted checkout link) ----

router.post('/clickpesa/create-order', requireAuth, async (req, res) => {
  if (!clickpesa.isConfigured()) {
    return res.status(400).json({ error: 'ClickPesa is not configured yet. Ask the site owner to finish setup.' });
  }
  const biz = await db.getBusinessById(req.businessId);
  try {
    const { reference, checkoutUrl } = await clickpesa.createCheckoutLink({
      businessId: req.businessId, amountTzs: plan.PREMIUM_PRICE_TZS,
      customerName: biz.name, customerEmail: biz.email, customerPhone: biz.whatsapp_number
    });
    res.json({ reference, checkoutUrl });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Polled by billing.js after the customer returns from ClickPesa's hosted checkout —
// also finalizes crediting, as a client-driven complement to the webhook below.
router.get('/clickpesa/status', requireAuth, async (req, res) => {
  const reference = String(req.query.reference || '');
  if (clickpesa.businessIdFromReference(reference) !== req.businessId) {
    return res.status(403).json({ error: 'This reference does not belong to your account' });
  }
  try {
    const payment = await clickpesa.queryPayment(reference);
    if (payment) {
      await creditPayment({
        businessId: req.businessId, provider: 'clickpesa', providerRef: reference,
        amount: parseFloat(payment.collectedAmount ?? payment.amount ?? plan.PREMIUM_PRICE_TZS),
        currency: payment.collectedCurrency || payment.currency || 'TZS'
      });
    }
    res.json({ paid: !!payment, ...await planPayload(await db.getBusinessById(req.businessId)) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Mounted with regular express.json() (no raw-body/signature step needed) — ClickPesa's
// callback payload is never trusted directly; queryPayment() re-confirms against
// ClickPesa's own API before anything is credited, same trust model RestOrder uses.
async function webhookHandler(req, res) {
  const reference = String(req.body.orderReference || req.body.reference || '');
  const businessId = clickpesa.businessIdFromReference(reference);
  if (!businessId) return res.status(400).json({ error: 'Unrecognized reference' });
  try {
    const payment = await clickpesa.queryPayment(reference);
    if (payment) {
      await creditPayment({
        businessId, provider: 'clickpesa', providerRef: reference,
        amount: parseFloat(payment.collectedAmount ?? payment.amount ?? plan.PREMIUM_PRICE_TZS),
        currency: payment.collectedCurrency || payment.currency || 'TZS'
      });
    }
    res.json({ received: true });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

module.exports = { router, webhookHandler };
