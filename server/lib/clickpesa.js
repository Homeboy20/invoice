// ClickPesa (Tanzania mobile money — M-Pesa, Tigo Pesa, Airtel Money — plus cards)
// hosted checkout-link REST client. Same endpoints already proven working in this
// codebase's RestOrder platform (E:\github\menu\server.js getClickPesaAccessToken /
// queryClickPesaPayment, routes\payments.js create-order-public). No npm SDK — this
// environment has no registry access, and ClickPesa's API is plain REST + JSON anyway.
//
// Like PayPal here, this is a one-off payment (not a subscription): a successful
// checkout buys 30 days of Premium (lib/plan.js PREMIUM_DAYS_PER_PAYMENT). The webhook
// handler never trusts the callback payload's status field — it calls queryPayment()
// back against ClickPesa itself before crediting anything, mirroring RestOrder's own
// webhook trust model (routes\webhooks.js clickpesa handler).

const crypto = require('node:crypto');

const CLICKPESA_API_KEY = process.env.CLICKPESA_API_KEY || '';
const CLICKPESA_CLIENT_ID = process.env.CLICKPESA_CLIENT_ID || '';
const CLICKPESA_BASE_URL = (process.env.CLICKPESA_BASE_URL || 'https://api.clickpesa.com').replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:4100').replace(/\/$/, '');

function isConfigured() {
  return !!(CLICKPESA_API_KEY && CLICKPESA_CLIENT_ID);
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error('ClickPesa is not configured (CLICKPESA_API_KEY/CLIENT_ID missing)');
  const res = await fetch(CLICKPESA_BASE_URL + '/third-parties/generate-token', {
    method: 'POST',
    headers: { 'api-key': CLICKPESA_API_KEY, 'client-id': CLICKPESA_CLIENT_ID }
  });
  const data = await res.json().catch(() => ({}));
  const token = String(data.token || '').trim();
  if (!res.ok || !token) throw new Error(data.message || data.error || 'ClickPesa authentication failed');
  return token.startsWith('Bearer ') ? token : 'Bearer ' + token;
}

// businessId is embedded in the reference so the webhook (which arrives with no auth
// context) knows which tenant to credit — it's not secret, and is re-verified against
// ClickPesa itself (not trusted from the reference or the webhook body) before crediting.
function makeReference(businessId) {
  return `printdesk:${businessId}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
}

function businessIdFromReference(reference) {
  const parts = String(reference || '').split(':');
  return parts[0] === 'printdesk' ? parts[1] : null;
}

async function createCheckoutLink({ businessId, amountTzs, customerName, customerEmail, customerPhone }) {
  const token = await getAccessToken();
  const reference = makeReference(businessId);
  const res = await fetch(CLICKPESA_BASE_URL + '/third-parties/checkout-link/generate-checkout-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      totalPrice: amountTzs.toFixed(2),
      orderReference: reference,
      orderCurrency: 'TZS',
      customerName: customerName || 'PrintDesk Customer',
      customerEmail: customerEmail || '',
      customerPhone: String(customerPhone || '').replace(/\D/g, '').slice(0, 20),
      description: 'PrintDesk Premium — 30 days',
      callbackUrl: `${SITE_URL}/api/billing/clickpesa/webhook`
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.checkoutLink) throw new Error(data.message || data.error || 'Failed to create ClickPesa checkout link');
  return { reference, checkoutUrl: data.checkoutLink };
}

// Returns the matching row if ClickPesa confirms SUCCESS/SETTLED, else null — callers
// must treat null as "not paid yet", not as an error.
async function queryPayment(reference) {
  const token = await getAccessToken();
  const res = await fetch(CLICKPESA_BASE_URL + `/third-parties/payments/${encodeURIComponent(reference)}`, {
    headers: { Authorization: token }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || data?.error || 'ClickPesa status lookup failed');
  const rows = Array.isArray(data) ? data : [data].filter(Boolean);
  return rows.find((r) => ['SUCCESS', 'SETTLED'].includes(String(r?.status || '').toUpperCase())) || null;
}

module.exports = { isConfigured, createCheckoutLink, queryPayment, businessIdFromReference };
