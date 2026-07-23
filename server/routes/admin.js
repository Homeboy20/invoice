// Platform admin panel API — manages the PrintDesk business itself (all tenants), not
// any one print shop's data. Every route here is authenticated by lib/adminAuth's
// requireAdmin, which is deliberately a separate token type from tenant auth.

const express = require('express');
const db = require('../lib/db');
const plan = require('../lib/plan');
const sanitize = require('../lib/sanitize');
const adminAuth = require('../lib/adminAuth');

const router = express.Router();

router.post('/login', (req, res) => {
  if (!adminAuth.isConfigured()) {
    return res.status(400).json({ error: 'Admin panel is not configured (ADMIN_PASSWORD not set)' });
  }
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!adminAuth.checkPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.json({ token: adminAuth.issueAdminToken() });
});

router.use(adminAuth.requireAdmin);

function publicBusinessRow(row) {
  return {
    id: row.id, name: row.name, email: row.email,
    plan: row.plan, premiumUntil: row.premium_until,
    isPremium: plan.isPremium(row), subscriptionStatus: row.subscription_status,
    invoiceCount: row.invoice_count, staffCount: row.staff_count,
    createdAt: row.created_at
  };
}

router.get('/stats', async (req, res) => {
  res.json(await db.platformStats(Date.now()));
});

router.get('/businesses', async (req, res) => {
  const search = sanitize.str(req.query.search, 200);
  const limit = sanitize.int(req.query.limit, 200, 1);
  const rows = await db.listAllBusinesses(search, Math.min(limit, 500));
  res.json({ businesses: rows.map(publicBusinessRow) });
});

router.get('/payments', async (req, res) => {
  const limit = sanitize.int(req.query.limit, 50, 1);
  res.json({ payments: await db.listAllPayments(Math.min(limit, 200)) });
});

// Comp free Premium days — support gesture, promo, or manual reconciliation when a
// payment landed outside the automated flow (e.g. a bank transfer arranged by email).
router.post('/businesses/:id/comp', async (req, res) => {
  const biz = await db.getBusinessById(req.params.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const days = sanitize.int(req.body.days, 30, 1);
  const until = await db.extendPremium(biz.id, Math.min(days, 3650));
  res.json({ premiumUntil: until });
});

router.post('/businesses/:id/downgrade', async (req, res) => {
  const biz = await db.getBusinessById(req.params.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  await db.downgradeToFree(biz.id);
  res.json({ ok: true });
});

module.exports = router;
