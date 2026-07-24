// Multi-tenant storage on PostgreSQL. Every business is a tenant; every tenant-owned
// table carries business_id and is always filtered by it — same isolation pattern as
// the RestOrder platform's customer_id. Pool setup mirrors RestOrder's own
// (E:\github\menu\server.js) so the two apps behave identically under Coolify.

const { Pool, types } = require('pg');
const crypto = require('node:crypto');

// node-postgres returns BIGINT (OID 20) as a string by default — safe in general since
// JS numbers can't exactly represent the full 64-bit range, but every BIGINT column and
// COUNT(*) result in this schema is either an epoch-ms timestamp or a row count, both
// always well under Number.MAX_SAFE_INTEGER. Left at the default, premium_until/
// created_at would come back as e.g. "1787420727977" — a string that silently produces
// "Invalid Date" when the frontend does `new Date(ms)` (Date's single-string-arg form
// expects an ISO date string, not a raw epoch numeral). Overriding globally here means
// every function below can treat these columns as plain numbers, matching the SQLite
// version's behavior exactly.
types.setTypeParser(20, (val) => parseInt(val, 10));

const PG_POOL_MAX = Math.max(1, parseInt(process.env.PG_POOL_MAX || '20', 10));

// Determine SSL from an explicit ?sslmode=... in DATABASE_URL before stripping it from
// the string — pg-connection-string would otherwise parse sslmode from the URL itself
// too and could disagree with the explicit `ssl` option passed to Pool below (same
// defensive pattern this codebase's RestOrder platform uses in server.js). Our own
// docker-compose.yml sets sslmode=disable explicitly, since the bundled `db` service
// reaches the app over the private Docker network by its service name (`db:5432`) —
// not "localhost" — so the old hostname-only heuristic wrongly required SSL against a
// Postgres container that doesn't have it configured at all ("the server does not
// support SSL connections"). The heuristic is kept as a fallback for a bare
// DATABASE_URL with no sslmode at all (e.g. plain local dev).
const rawConnectionString = process.env.DATABASE_URL || '';
let connectionString = rawConnectionString;
let explicitSslMode = '';
try {
  const u = new URL(rawConnectionString);
  explicitSslMode = u.searchParams.get('sslmode') || '';
  u.searchParams.delete('sslmode');
  connectionString = u.toString();
} catch { /* empty or non-URL DATABASE_URL — use as-is */ }

let sslConfig;
if (explicitSslMode === 'disable') {
  sslConfig = false;
} else if (explicitSslMode) {
  sslConfig = { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' };
} else {
  const isLocalDB = !rawConnectionString || rawConnectionString.includes('localhost') || rawConnectionString.includes('127.0.0.1');
  sslConfig = isLocalDB ? false : { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' };
}

const pool = new Pool({
  connectionString,
  max: PG_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: sslConfig
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_PRICES = {
  bannerPerSqm: 25000, teardropBanner: 180000, largeFormatPerSqm: 35000,
  tshirt: 15000, tshirtBulkQty: 12, tshirtBulk: 12000,
  businessCards100: 30000, stickerPerSqm: 40000, logoDesign: 100000, mugPrint: 12000
};

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(12).toString('hex');
}

// Runs once at startup (awaited from index.js before the server accepts requests) —
// timestamps are stored as epoch-ms BIGINTs throughout, matching the JS Date.now()
// convention the rest of the app already uses, rather than native Postgres TIMESTAMP.
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      biz_email TEXT NOT NULL DEFAULT '',
      tin TEXT NOT NULL DEFAULT '',
      vrn TEXT NOT NULL DEFAULT '',
      whatsapp_number TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'en',
      currency TEXT NOT NULL DEFAULT 'TZS',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV',
      next_invoice_number INTEGER NOT NULL DEFAULT 1,
      vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      vat_rate REAL NOT NULL DEFAULT 18,
      accent_color TEXT NOT NULL DEFAULT '#d92027',
      invoice_terms TEXT NOT NULL DEFAULT 'Thank you for your business!',
      prices_json TEXT NOT NULL,
      logo_data_url TEXT,
      logo_w INTEGER,
      logo_h INTEGER,
      plan TEXT NOT NULL DEFAULT 'free',
      premium_until BIGINT,
      subscription_status TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_business ON staff_users(business_id);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      date_str TEXT NOT NULL,
      served_by TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(business_id, number);

    -- One row per successful (or attempted) payment. provider_ref is the gateway's own
    -- order/transaction id — the UNIQUE index is what makes webhook and capture-order
    -- handlers idempotent: replays and duplicate confirmations can never double-extend.
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_ref TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      days_added INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider, provider_ref);
    CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id, created_at DESC);
  `);

  // Unlike SQLite, Postgres supports ADD COLUMN IF NOT EXISTS natively — this only
  // matters for a redeploy against a database created before a given column existed;
  // CREATE TABLE IF NOT EXISTS above already covers a fresh database.
  await pool.query(`
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS premium_until BIGINT;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_status TEXT;
  `);
}

// ---- businesses ----

async function createBusiness({ name, email, passwordHash }) {
  const id = newId('biz');
  const now = Date.now();
  await pool.query(
    `INSERT INTO businesses (id, name, email, password_hash, prices_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name, email.toLowerCase(), passwordHash, JSON.stringify(DEFAULT_PRICES), now]
  );
  await pool.query(
    `INSERT INTO staff_users (id, business_id, name, created_at) VALUES ($1, $2, $3, $4)`,
    [newId('usr'), id, 'Owner', now]
  );
  return getBusinessById(id);
}

async function getBusinessByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE email = $1', [email.toLowerCase()]);
  return rows[0] || null;
}

async function getBusinessById(id) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
  return rows[0] || null;
}

const BUSINESS_UPDATE_FIELDS = [
  'name', 'address', 'phone', 'biz_email', 'tin', 'vrn', 'whatsapp_number',
  'language', 'currency', 'invoice_prefix', 'vat_enabled', 'vat_rate',
  'accent_color', 'invoice_terms', 'prices_json'
];

async function updateBusiness(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of BUSINESS_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getBusinessById(id);
  values.push(id);
  await pool.query(`UPDATE businesses SET ${sets.join(', ')} WHERE id = $${i}`, values);
  return getBusinessById(id);
}

async function updateBusinessLogo(id, logo) {
  await pool.query(
    'UPDATE businesses SET logo_data_url = $1, logo_w = $2, logo_h = $3 WHERE id = $4',
    [logo ? logo.dataUrl : null, logo ? logo.w : null, logo ? logo.h : null, id]
  );
}

// Atomic single round-trip: increments next_invoice_number and returns the value it
// held BEFORE the increment, in one UPDATE...RETURNING. This matters more here than it
// did under SQLite — that ran single-threaded and synchronous, so a read-then-write
// could never interleave; an async pool with concurrent requests genuinely can, so a
// separate read + write would risk two requests allocating the same invoice number.
async function allocateInvoiceNumber(businessId) {
  const { rows } = await pool.query(
    `UPDATE businesses SET next_invoice_number = next_invoice_number + 1
     WHERE id = $1 RETURNING next_invoice_number - 1 AS allocated, invoice_prefix`,
    [businessId]
  );
  const row = rows[0];
  const year = new Date().getFullYear();
  return row.invoice_prefix + '-' + year + '-' + String(row.allocated).padStart(4, '0');
}

// ---- staff ----

async function listStaff(businessId) {
  const { rows } = await pool.query(
    'SELECT id, name FROM staff_users WHERE business_id = $1 ORDER BY created_at', [businessId]
  );
  return rows;
}

async function addStaff(businessId, name) {
  const id = newId('usr');
  await pool.query(
    'INSERT INTO staff_users (id, business_id, name, created_at) VALUES ($1, $2, $3, $4)',
    [id, businessId, name, Date.now()]
  );
  return { id, name };
}

async function removeStaff(businessId, staffId) {
  const remaining = await listStaff(businessId);
  if (remaining.length <= 1) return false; // always keep at least one
  await pool.query('DELETE FROM staff_users WHERE id = $1 AND business_id = $2', [staffId, businessId]);
  return true;
}

async function countStaff(businessId) {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM staff_users WHERE business_id = $1', [businessId]);
  return parseInt(rows[0].n, 10);
}

// ---- invoices ----

async function createInvoice(businessId, inv) {
  const id = newId('inv');
  await pool.query(
    `INSERT INTO invoices (id, business_id, number, date_str, served_by, customer_name,
      customer_phone, items_json, subtotal, discount, vat_rate, vat_amount, grand_total, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, businessId, inv.number, inv.dateStr, inv.servedBy,
      inv.customer.name || '', inv.customer.phone || '',
      JSON.stringify(inv.lines), inv.subtotal, inv.discount,
      inv.vatRate, inv.vatAmount, inv.grandTotal, Date.now()
    ]
  );
  return getInvoiceById(businessId, id);
}

async function listInvoices(businessId, limit) {
  const { rows } = await pool.query(
    'SELECT * FROM invoices WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2',
    [businessId, limit || 50]
  );
  return rows;
}

async function getInvoiceById(businessId, id) {
  const { rows } = await pool.query(
    'SELECT * FROM invoices WHERE id = $1 AND business_id = $2', [id, businessId]
  );
  return rows[0] || null;
}

// Invoices created since the 1st of the current calendar month (server clock) —
// the window the free tier's monthly cap is measured against.
async function countInvoicesThisMonth(businessId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS n FROM invoices WHERE business_id = $1 AND created_at >= $2',
    [businessId, startOfMonth]
  );
  return parseInt(rows[0].n, 10);
}

// ---- billing ----
// No gateway here auto-renews (PayPal Orders and ClickPesa are both one-off payment
// APIs, not subscriptions) — Premium is "paid for N days", extended from whichever is
// later: the current expiry (renewing early stacks on top) or now (first purchase, or
// renewing after already lapsing). isPremium() in lib/plan.js is what actually gates
// features; it re-evaluates premium_until on every check, so nothing needs a cron job
// to "expire" a business — it simply stops qualifying the moment premium_until passes.
//
// This is a single atomic UPDATE...RETURNING (GREATEST/COALESCE compute the new expiry
// in SQL) rather than a JS read-then-write — same concurrency reasoning as
// allocateInvoiceNumber above: an async pool can interleave two concurrent payments for
// the same business, so the read and write must happen in one round trip.
async function extendPremium(businessId, days) {
  const now = Date.now();
  const { rows } = await pool.query(
    `UPDATE businesses
     SET plan = 'premium',
         premium_until = GREATEST(COALESCE(premium_until, 0), $2) + $3,
         subscription_status = 'active'
     WHERE id = $1
     RETURNING premium_until`,
    [businessId, now, days * DAY_MS]
  );
  return rows[0].premium_until;
}

// Immediate manual downgrade (admin action — e.g. refund, abuse, support request).
async function downgradeToFree(businessId) {
  await pool.query(
    "UPDATE businesses SET plan = 'free', premium_until = NULL, subscription_status = 'downgraded' WHERE id = $1",
    [businessId]
  );
}

async function hasPayment(provider, providerRef) {
  const { rows } = await pool.query(
    'SELECT id FROM payments WHERE provider = $1 AND provider_ref = $2', [provider, providerRef]
  );
  return rows.length > 0;
}

// ON CONFLICT DO NOTHING (backed by the UNIQUE(provider, provider_ref) index) means a
// replayed webhook or a double-submitted capture can never be recorded — or extend
// premium — twice. RETURNING id is empty when the conflict branch fired, so rowCount
// tells the caller whether this was truly a new payment.
async function recordPayment({ businessId, provider, providerRef, amount, currency, daysAdded, status }) {
  const id = newId('pay');
  const result = await pool.query(
    `INSERT INTO payments (id, business_id, provider, provider_ref, amount, currency, days_added, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (provider, provider_ref) DO NOTHING
     RETURNING id`,
    [id, businessId, provider, providerRef, amount, currency, daysAdded || 0, status, Date.now()]
  );
  return result.rowCount > 0;
}

async function listPaymentsForBusiness(businessId, limit) {
  const { rows } = await pool.query(
    'SELECT * FROM payments WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2',
    [businessId, limit || 20]
  );
  return rows;
}

async function listAllPayments(limit) {
  const { rows } = await pool.query(
    `SELECT p.*, b.name AS business_name, b.email AS business_email
     FROM payments p JOIN businesses b ON b.id = p.business_id
     ORDER BY p.created_at DESC LIMIT $1`,
    [limit || 50]
  );
  return rows;
}

// ---- admin (platform-wide, not tenant-scoped) ----

async function listAllBusinesses(search, limit) {
  const q = '%' + (search || '') + '%';
  const { rows } = await pool.query(
    `SELECT id, name, email, plan, premium_until, subscription_status, created_at,
       (SELECT COUNT(*) FROM invoices i WHERE i.business_id = businesses.id) AS invoice_count,
       (SELECT COUNT(*) FROM staff_users s WHERE s.business_id = businesses.id) AS staff_count
     FROM businesses
     WHERE name ILIKE $1 OR email ILIKE $1
     ORDER BY created_at DESC LIMIT $2`,
    [q, limit || 200]
  );
  return rows.map((r) => ({ ...r, invoice_count: parseInt(r.invoice_count, 10), staff_count: parseInt(r.staff_count, 10) }));
}

async function platformStats(now) {
  const totalRes = await pool.query('SELECT COUNT(*) AS n FROM businesses');
  const totalBusinesses = parseInt(totalRes.rows[0].n, 10);

  const premiumRes = await pool.query(
    "SELECT COUNT(*) AS n FROM businesses WHERE plan = 'premium' AND premium_until > $1", [now]
  );
  const premiumCount = parseInt(premiumRes.rows[0].n, 10);

  const invoicesRes = await pool.query('SELECT COUNT(*) AS n FROM invoices');
  const totalInvoices = parseInt(invoicesRes.rows[0].n, 10);

  const now30 = now - 30 * DAY_MS;
  const invoices30dRes = await pool.query('SELECT COUNT(*) AS n FROM invoices WHERE created_at >= $1', [now30]);
  const invoicesLast30d = parseInt(invoices30dRes.rows[0].n, 10);

  const revenueRes = await pool.query(
    "SELECT COALESCE(SUM(amount),0) AS total, currency FROM payments WHERE status = 'completed' GROUP BY currency"
  );
  const revenueByCurrency = revenueRes.rows.map((r) => ({ total: parseFloat(r.total), currency: r.currency }));

  return {
    totalBusinesses, premiumCount, freeCount: totalBusinesses - premiumCount,
    totalInvoices, invoicesLast30d, revenueByCurrency
  };
}

module.exports = {
  pool, initSchema,
  DEFAULT_PRICES,
  createBusiness, getBusinessByEmail, getBusinessById, updateBusiness, updateBusinessLogo,
  allocateInvoiceNumber,
  listStaff, addStaff, removeStaff, countStaff,
  createInvoice, listInvoices, getInvoiceById, countInvoicesThisMonth,
  extendPremium, downgradeToFree, hasPayment, recordPayment, listPaymentsForBusiness, listAllPayments,
  listAllBusinesses, platformStats
};
