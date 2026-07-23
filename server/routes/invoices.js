const express = require('express');
const db = require('../lib/db');
const plan = require('../lib/plan');
const { requireAuth } = require('../lib/auth');
const sanitize = require('../lib/sanitize');
const { buildPdfBytes } = require('../lib/pdf');

const router = express.Router();
router.use(requireAuth);

function publicInvoice(row) {
  return {
    id: row.id, number: row.number, dateStr: row.date_str, servedBy: row.served_by,
    customer: { name: row.customer_name, phone: row.customer_phone },
    lines: JSON.parse(row.items_json),
    subtotal: row.subtotal, discount: row.discount,
    vatRate: row.vat_rate, vatAmount: row.vat_amount, grandTotal: row.grand_total
  };
}

// Sanitize and recompute totals server-side — never trust client-submitted amounts.
function computeLines(body) {
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const cleaned = lines
    .map((l) => ({
      desc: sanitize.str(l.desc, 300),
      qty: sanitize.num(l.qty, 0, 0),
      unit: sanitize.num(l.unit, 0, 0)
    }))
    .filter((l) => l.desc)
    .map((l) => ({ ...l, total: l.qty * l.unit }));

  const subtotal = cleaned.reduce((s, l) => s + l.total, 0);
  const discount = Math.min(subtotal, sanitize.num(body.discount, 0, 0));
  const vatRate = sanitize.num(body.vatRate, 0, 0, 100);
  const base = Math.max(0, subtotal - discount);
  const vatAmount = base * (vatRate / 100);
  return { lines: cleaned, subtotal, discount, vatRate, vatAmount, grandTotal: base + vatAmount };
}

router.get('/invoices', async (req, res) => {
  const limit = sanitize.int(req.query.limit, 50, 1);
  const rows = await db.listInvoices(req.businessId, Math.min(limit, 200));
  res.json({ invoices: rows.map(publicInvoice) });
});

router.post('/invoices', async (req, res) => {
  const business = await db.getBusinessById(req.businessId);
  const limitError = await plan.checkInvoiceLimit(business);
  if (limitError) return res.status(402).json({ error: limitError, upgradeRequired: true });

  const totals = computeLines(req.body);
  if (!totals.lines.length) return res.status(400).json({ error: 'At least one line item is required' });

  const staff = await db.listStaff(req.businessId);
  const servedBy = staff.find((u) => u.id === req.body.servedByUserId) || staff[0];
  const number = await db.allocateInvoiceNumber(req.businessId);

  const invoice = await db.createInvoice(req.businessId, {
    number,
    dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    servedBy: servedBy ? servedBy.name : 'Owner',
    customer: {
      name: sanitize.str(req.body.customerName, 150),
      phone: sanitize.str(req.body.customerPhone, 40)
    },
    ...totals
  });
  res.status(201).json({ invoice: publicInvoice(invoice) });
});

router.get('/invoices/:id/pdf', async (req, res) => {
  const invoice = await db.getInvoiceById(req.businessId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const business = await db.getBusinessById(req.businessId);
  const bytes = buildPdfBytes(business, invoice, { watermark: !plan.isPremium(business) });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
  res.send(Buffer.from(bytes));
});

module.exports = router;
