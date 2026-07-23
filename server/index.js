const express = require('express');
const path = require('node:path');

const db = require('./lib/db');
const { router: authRoutes } = require('./routes/auth');
const businessRoutes = require('./routes/business');
const invoiceRoutes = require('./routes/invoices');
const { router: billingRoutes, webhookHandler } = require('./routes/billing');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4100;

app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));

// More specific mount paths must come before the generic '/api' below: businessRoutes
// applies requireAuth unconditionally via router.use(), which — because Express matches
// by path prefix in registration order — would otherwise intercept every '/api/...'
// request (including /api/admin/login, which must NOT require a tenant session) before
// it ever reached its actual router.
app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
// ClickPesa's callback is never trusted on its own (see routes/billing.js webhookHandler
// — it re-verifies via queryPayment), so unlike Stripe's old webhook this needs no raw
// body / signature step and can sit after the global JSON parser like any other route.
app.post('/api/billing/clickpesa/webhook', webhookHandler);
app.use('/api/admin', adminRoutes);
app.use('/api', businessRoutes);
app.use('/api', invoiceRoutes);

// Actually checks the database, not just "the Node process is alive" — Coolify's
// healthcheck should fail (and restart/alert) if Postgres is unreachable, not report
// healthy while every real request would 500.
app.get('/healthz', async (req, res) => {
  try {
    await db.pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'database unreachable' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

db.initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`PrintDesk server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema — is DATABASE_URL set and reachable?', err);
    process.exit(1);
  });
