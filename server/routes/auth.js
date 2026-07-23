const express = require('express');
const db = require('../lib/db');
const plan = require('../lib/plan');
const { hashPassword, verifyPassword, issueToken } = require('../lib/auth');
const sanitize = require('../lib/sanitize');

const router = express.Router();

function publicBusiness(biz) {
  return {
    id: biz.id, name: biz.name, email: biz.email,
    address: biz.address, phone: biz.phone, bizEmail: biz.biz_email,
    tin: biz.tin, vrn: biz.vrn, whatsappNumber: biz.whatsapp_number,
    language: biz.language, currency: biz.currency,
    invoicePrefix: biz.invoice_prefix, nextInvoiceNumber: biz.next_invoice_number,
    vatEnabled: !!biz.vat_enabled, vatRate: biz.vat_rate,
    accentColor: biz.accent_color, invoiceTerms: biz.invoice_terms,
    prices: JSON.parse(biz.prices_json),
    logo: biz.logo_data_url ? { dataUrl: biz.logo_data_url, w: biz.logo_w, h: biz.logo_h } : null,
    plan: biz.plan, premiumUntil: biz.premium_until, isPremium: plan.isPremium(biz)
  };
}

router.post('/register', async (req, res) => {
  const name = sanitize.str(req.body.businessName, 200);
  const email = sanitize.email(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name) return res.status(400).json({ error: 'Business name is required' });
  if (!email) return res.status(400).json({ error: 'A valid email is required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  if (await db.getBusinessByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await hashPassword(password);
  const biz = await db.createBusiness({ name, email, passwordHash });
  res.status(201).json({ token: issueToken(biz.id), business: publicBusiness(biz) });
});

router.post('/login', async (req, res) => {
  const email = sanitize.email(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const biz = email ? await db.getBusinessByEmail(email) : null;
  const ok = biz && await verifyPassword(password, biz.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: issueToken(biz.id), business: publicBusiness(biz) });
});

module.exports = { router, publicBusiness };
