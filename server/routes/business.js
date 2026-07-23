const express = require('express');
const db = require('../lib/db');
const plan = require('../lib/plan');
const { requireAuth } = require('../lib/auth');
const sanitize = require('../lib/sanitize');
const { publicBusiness } = require('./auth');

const router = express.Router();
router.use(requireAuth);

router.get('/me', async (req, res) => {
  const biz = await db.getBusinessById(req.businessId);
  const staff = await db.listStaff(req.businessId);
  res.json({ business: publicBusiness(biz), staff });
});

router.put('/business', async (req, res) => {
  const b = req.body || {};
  const current = await db.getBusinessById(req.businessId);
  const currentPrices = JSON.parse(current.prices_json);
  const prices = {};
  for (const key of Object.keys(db.DEFAULT_PRICES)) {
    prices[key] = sanitize.num((b.prices || {})[key], currentPrices[key], 0);
  }
  // vatEnabled and vatRate are independent: omitting one must never flip the other,
  // so each falls back to the business's own current stored value, not a shared default.
  const vatEnabled = typeof b.vatEnabled === 'boolean' ? b.vatEnabled : !!current.vat_enabled;
  const vatRate = sanitize.num(b.vatRate, current.vat_rate, 0, 100);

  const updated = await db.updateBusiness(req.businessId, {
    name: sanitize.str(b.businessName, 200) || current.name,
    address: sanitize.str(b.businessAddress, 500),
    phone: sanitize.str(b.businessPhone, 40),
    biz_email: sanitize.str(b.businessEmail, 200),
    tin: sanitize.str(b.tin, 60),
    vrn: sanitize.str(b.vrn, 60),
    whatsapp_number: sanitize.str(b.whatsappNumber, 20).replace(/[^\d]/g, ''),
    language: b.language === 'sw' ? 'sw' : 'en',
    currency: sanitize.str(b.currency, 10) || 'TZS',
    invoice_prefix: sanitize.str(b.invoicePrefix, 20) || 'INV',
    vat_enabled: vatEnabled,
    vat_rate: vatRate,
    accent_color: /^#[0-9a-f]{6}$/i.test(b.accentColor || '') ? b.accentColor : current.accent_color,
    invoice_terms: sanitize.str(b.invoiceTerms, 500),
    prices_json: JSON.stringify(prices)
  });
  res.json({ business: publicBusiness(updated) });
});

router.put('/business/logo', async (req, res) => {
  const { dataUrl, w, h } = req.body || {};
  if (dataUrl === null) {
    await db.updateBusinessLogo(req.businessId, null);
    return res.json({ ok: true });
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > 2_000_000) {
    return res.status(400).json({ error: 'Invalid logo image' });
  }
  await db.updateBusinessLogo(req.businessId, { dataUrl, w: sanitize.int(w, 0), h: sanitize.int(h, 0) });
  res.json({ ok: true });
});

router.get('/staff', async (req, res) => {
  res.json({ staff: await db.listStaff(req.businessId) });
});

router.post('/staff', async (req, res) => {
  const business = await db.getBusinessById(req.businessId);
  const limitError = await plan.checkStaffLimit(business);
  if (limitError) return res.status(402).json({ error: limitError, upgradeRequired: true });

  const name = sanitize.str(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  res.status(201).json({ staff: await db.addStaff(req.businessId, name) });
});

router.delete('/staff/:id', async (req, res) => {
  const removed = await db.removeStaff(req.businessId, req.params.id);
  if (!removed) return res.status(400).json({ error: 'A business must keep at least one staff user' });
  res.json({ ok: true });
});

module.exports = router;
