// Freemium/premium rules — the free tier caps volume and watermarks PDFs; premium
// (paid via PayPal or ClickPesa, one-off payments extending premium_until — see
// lib/paypal.js, lib/clickpesa.js) lifts both. Kept as one place so the limits enforced
// in routes match the numbers shown to the user in the billing UI.

const db = require('./db');

const FREE_INVOICE_LIMIT_PER_MONTH = 20;
const FREE_STAFF_LIMIT = 1;
const PREMIUM_DAYS_PER_PAYMENT = 30;
const PREMIUM_PRICE_USD = 9;
const PREMIUM_PRICE_TZS = 25000;
const PREMIUM_PRICE_LABEL = '$9 or 25,000 TZS / 30 days';

// Re-evaluated on every call against premium_until — nothing needs a cron job to
// "expire" a business; it just stops qualifying the moment premium_until passes.
function isPremium(business) {
  return business.plan === 'premium' && !!business.premium_until && business.premium_until > Date.now();
}

async function invoiceUsage(businessId) {
  const used = await db.countInvoicesThisMonth(businessId);
  return { used, limit: FREE_INVOICE_LIMIT_PER_MONTH, remaining: Math.max(0, FREE_INVOICE_LIMIT_PER_MONTH - used) };
}

async function staffUsage(businessId) {
  const used = await db.countStaff(businessId);
  return { used, limit: FREE_STAFF_LIMIT, remaining: Math.max(0, FREE_STAFF_LIMIT - used) };
}

// Returns an error message if creating one more invoice would exceed the free cap,
// or null if the business may proceed (premium businesses are never capped).
async function checkInvoiceLimit(business) {
  if (isPremium(business)) return null;
  const usage = await invoiceUsage(business.id);
  if (usage.used >= usage.limit) {
    return `Free plan limit reached: ${usage.limit} invoices this month. Upgrade to Premium for unlimited invoices.`;
  }
  return null;
}

async function checkStaffLimit(business) {
  if (isPremium(business)) return null;
  const usage = await staffUsage(business.id);
  if (usage.used >= usage.limit) {
    return `Free plan limit reached: ${usage.limit} staff user. Upgrade to Premium to add more.`;
  }
  return null;
}

module.exports = {
  FREE_INVOICE_LIMIT_PER_MONTH, FREE_STAFF_LIMIT, PREMIUM_PRICE_LABEL,
  PREMIUM_DAYS_PER_PAYMENT, PREMIUM_PRICE_USD, PREMIUM_PRICE_TZS,
  isPremium, invoiceUsage, staffUsage, checkInvoiceLimit, checkStaffLimit
};
