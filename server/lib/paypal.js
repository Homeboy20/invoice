// PayPal Orders v2 REST client — no SDK (no npm registry access in this environment),
// same endpoints/flow already proven working in this codebase's own RestOrder platform
// (see E:\github\menu\server.js getPayPalAccessToken / routes\payments.js create-order
// + capture-order). PrintDesk uses the redirect-based integration (application_context
// return_url/cancel_url) rather than the client-side JS SDK buttons RestOrder's own
// checkout page uses, so no extra frontend script is required — same pattern already
// used for the (now-removed) Stripe Checkout redirect.
//
// Orders API, not Subscriptions API: each payment is a single $9 charge that buys 30
// days of Premium (see lib/plan.js PREMIUM_DAYS_PER_PAYMENT) — there is no PayPal
// auto-renewal to manage, so no Billing Plan needs to be pre-created in the dashboard.

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
const SITE_URL = (process.env.SITE_URL || 'http://localhost:4100').replace(/\/$/, '');

function isConfigured() {
  return !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

function baseUrl() {
  return PAYPAL_ENVIRONMENT === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error('PayPal is not configured (PAYPAL_CLIENT_ID/SECRET missing)');
  const res = await fetch(baseUrl() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('PayPal authentication failed');
  return data.access_token;
}

// custom_id carries businessId through PayPal untouched — capture-order reads it back
// to know which tenant to credit, the same reference-smuggling pattern RestOrder uses.
async function createOrder({ businessId, amountUsd }) {
  const accessToken = await getAccessToken();
  const res = await fetch(baseUrl() + '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: amountUsd.toFixed(2) },
        description: 'PrintDesk Premium — 30 days',
        custom_id: businessId
      }],
      application_context: {
        brand_name: 'PrintDesk',
        user_action: 'PAY_NOW',
        return_url: `${SITE_URL}/billing.html?paypal=return`,
        cancel_url: `${SITE_URL}/billing.html?paypal=cancel`
      }
    })
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(data.message || 'Failed to create PayPal order');
  const approveUrl = (data.links || []).find((l) => l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error('PayPal did not return an approval link');
  return { orderId: data.id, approveUrl };
}

async function captureOrder(orderId) {
  const accessToken = await getAccessToken();
  const res = await fetch(baseUrl() + `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (data.status !== 'COMPLETED') throw new Error('PayPal payment was not completed');

  const businessId = data.purchase_units?.[0]?.custom_id;
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = parseFloat(capture?.amount?.value || '0');
  const currency = capture?.amount?.currency_code || 'USD';
  if (!businessId || !capture) throw new Error('PayPal capture response missing expected fields');
  return { businessId, amount, currency, captureId: capture.id };
}

module.exports = { isConfigured, createOrder, captureOrder };
