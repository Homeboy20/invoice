// Bridges a business + invoice DB row into the shape src/xpt-pdf.js expects.
// xpt-pdf.js is dependency-free and already Node-exportable — reused verbatim so the
// PDF a shop downloads from the web dashboard is pixel-identical to the extension's.

const path = require('node:path');
const { xptBuildInvoicePdf } = require(path.join(__dirname, '..', '..', 'src', 'xpt-pdf.js'));
const { labelsFor } = require('./i18n');

function money(amount, currency) {
  return Math.round(amount).toLocaleString('en-US') + ' ' + (currency || 'TZS');
}

function buildPdfBytes(business, invoice, opts) {
  const lines = JSON.parse(invoice.items_json);
  return xptBuildInvoicePdf({
    watermark: !!(opts && opts.watermark),
    watermarkText: 'FREE PLAN - PrintDesk',
    business: {
      name: business.name,
      addressLines: (business.address || '').split('\n').filter(Boolean),
      phone: business.phone, email: business.biz_email, tin: business.tin, vrn: business.vrn
    },
    logo: business.logo_data_url
      ? { dataUrl: business.logo_data_url, w: business.logo_w, h: business.logo_h }
      : null,
    accent: business.accent_color,
    number: invoice.number,
    dateStr: invoice.date_str,
    servedBy: invoice.served_by,
    customer: { name: invoice.customer_name, phone: invoice.customer_phone },
    currency: business.currency,
    lines,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    vatRate: invoice.vat_rate,
    vatAmount: invoice.vat_amount,
    grandTotal: invoice.grand_total,
    terms: business.invoice_terms,
    labels: labelsFor(business.language),
    money: (n) => money(n, business.currency)
  });
}

module.exports = { buildPdfBytes };
