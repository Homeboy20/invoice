// Minimal self-contained PDF 1.4 invoice writer. No dependencies, no DOM required
// (Node-testable). Fonts: base-14 Helvetica / Helvetica-Bold, ASCII text only.
// Logo: optional JPEG (DCTDecode XObject).

/* exported xptBuildInvoicePdf */

const XPT_PDF_A4 = { w: 595.28, h: 841.89 };

// Helvetica AFM widths for chars 32..126, in 1/1000 em.
const XPT_HELV_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

// Replace characters outside printable ASCII with close equivalents.
function xptPdfSanitize(str) {
  return String(str)
    .replace(/×/g, 'x').replace(/²/g, '2').replace(/–|—/g, '-')
    .replace(/’|‘/g, "'").replace(/“|”/g, '"').replace(/✕/g, 'x')
    .replace(/[^\x20-\x7e]/g, '?');
}

function xptPdfEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function xptTextWidth(str, size) {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    w += (c >= 32 && c <= 126) ? XPT_HELV_WIDTHS[c - 32] : 556;
  }
  return (w / 1000) * size;
}

function xptWrapText(str, size, maxWidth) {
  const words = xptPdfSanitize(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  words.forEach((word) => {
    const candidate = cur ? cur + ' ' + word : word;
    if (xptTextWidth(candidate, size) <= maxWidth || !cur) cur = candidate;
    else { lines.push(cur); cur = word; }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function xptHexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt(m ? m[1] : 'd92027', 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function xptRgbOp(rgb, stroke) {
  const f = (v) => v.toFixed(3);
  return f(rgb[0]) + ' ' + f(rgb[1]) + ' ' + f(rgb[2]) + (stroke ? ' RG' : ' rg');
}

// Content-stream builder for one page. Coordinates: y measured from TOP of page.
class XptPage {
  constructor() { this.ops = []; }
  _y(yTop) { return XPT_PDF_A4.h - yTop; }
  text(x, yTop, str, opts) {
    const o = opts || {};
    const size = o.size || 9;
    const font = o.bold ? 'F2' : 'F1';
    let tx = x;
    const clean = xptPdfSanitize(str);
    if (o.align === 'right') tx = x - xptTextWidth(clean, size) * (o.bold ? 1.02 : 1);
    // rotate: degrees counter-clockwise, for diagonal watermark text — everything else
    // renders horizontally (rotate omitted), so the identity matrix stays the common case.
    const angle = ((o.rotate || 0) * Math.PI) / 180;
    const matrix = o.rotate
      ? Math.cos(angle).toFixed(5) + ' ' + Math.sin(angle).toFixed(5) + ' ' +
        (-Math.sin(angle)).toFixed(5) + ' ' + Math.cos(angle).toFixed(5)
      : '1 0 0 1';
    this.ops.push(
      'BT ' + xptRgbOp(o.color || [0.1, 0.11, 0.13]) + ' /' + font + ' ' + size +
      ' Tf ' + matrix + ' ' + tx.toFixed(2) + ' ' + this._y(yTop).toFixed(2) + ' Tm (' +
      xptPdfEscape(clean) + ') Tj ET'
    );
  }
  rect(x, yTop, w, h, rgb) {
    this.ops.push(xptRgbOp(rgb) + ' ' + x.toFixed(2) + ' ' +
      (this._y(yTop) - h).toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f');
  }
  line(x1, yTop1, x2, yTop2, rgb, width) {
    this.ops.push(xptRgbOp(rgb, true) + ' ' + (width || 1) + ' w ' +
      x1.toFixed(2) + ' ' + this._y(yTop1).toFixed(2) + ' m ' +
      x2.toFixed(2) + ' ' + this._y(yTop2).toFixed(2) + ' l S');
  }
  image(x, yTop, w, h) {
    this.ops.push('q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) +
      ' ' + (this._y(yTop) - h).toFixed(2) + ' cm /Im1 Do Q');
  }
  stream() { return this.ops.join('\n'); }
}

function xptLatin1Bytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function xptDataUrlBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = (typeof atob !== 'undefined') ? atob(b64)
    : Buffer.from(b64, 'base64').toString('latin1');
  return xptLatin1Bytes(bin);
}

// Assemble a PDF from page content streams (+ optional JPEG logo).
function xptAssemblePdf(pages, logo) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (bytes) => { chunks.push(bytes); pos += bytes.length; };
  const pushStr = (s) => push(xptLatin1Bytes(s));
  const beginObj = (num) => { offsets[num] = pos; pushStr(num + ' 0 obj\n'); };

  const FONT1 = 1, FONT2 = 2, CATALOG = 3, PAGES = 4;
  const LOGO = logo ? 5 : 0;
  const firstPageObj = logo ? 6 : 5;
  // page i -> obj firstPageObj + i*2, its content -> +1
  const total = firstPageObj + pages.length * 2 - 1;

  pushStr('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

  beginObj(FONT1);
  pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
  beginObj(FONT2);
  pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');
  beginObj(CATALOG);
  pushStr('<< /Type /Catalog /Pages ' + PAGES + ' 0 R >>\nendobj\n');

  const kids = pages.map((_, i) => (firstPageObj + i * 2) + ' 0 R').join(' ');
  beginObj(PAGES);
  pushStr('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + kids + '] >>\nendobj\n');

  if (logo) {
    const imgBytes = xptDataUrlBytes(logo.dataUrl);
    beginObj(LOGO);
    pushStr('<< /Type /XObject /Subtype /Image /Width ' + logo.w + ' /Height ' + logo.h +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
      imgBytes.length + ' >>\nstream\n');
    push(imgBytes);
    pushStr('\nendstream\nendobj\n');
  }

  pages.forEach((page, i) => {
    const pageObj = firstPageObj + i * 2;
    const contentObj = pageObj + 1;
    const res = '<< /Font << /F1 ' + FONT1 + ' 0 R /F2 ' + FONT2 + ' 0 R >>' +
      (logo ? ' /XObject << /Im1 ' + LOGO + ' 0 R >>' : '') + ' >>';
    beginObj(pageObj);
    pushStr('<< /Type /Page /Parent ' + PAGES + ' 0 R /MediaBox [0 0 ' +
      XPT_PDF_A4.w + ' ' + XPT_PDF_A4.h + '] /Resources ' + res +
      ' /Contents ' + contentObj + ' 0 R >>\nendobj\n');
    const content = page.stream();
    beginObj(contentObj);
    pushStr('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
  });

  const xrefPos = pos;
  let xref = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= total; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pushStr(xref);
  pushStr('trailer\n<< /Size ' + (total + 1) + ' /Root ' + CATALOG +
    ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');

  const out = new Uint8Array(pos);
  let o = 0;
  chunks.forEach((c) => { out.set(c, o); o += c.length; });
  return out;
}

// ---- Invoice layout ----
// inv = { business:{name,addressLines,phone,email,tin,vrn}, logo:{dataUrl,w,h}|null,
//         accent, number, dateStr, servedBy, customer:{name,phone}, currency,
//         lines:[{desc,qty,unit,total}], subtotal, discount, vatRate, vatAmount,
//         grandTotal, terms, labels:{...}, money:(n)=>string }

function xptBuildInvoicePdf(inv) {
  const M = 40;                      // margin
  const W = XPT_PDF_A4.w;
  const accent = xptHexToRgb(inv.accent);
  const gray = [0.42, 0.45, 0.5];
  const ink = [0.1, 0.11, 0.13];
  const lightRow = [0.965, 0.97, 0.975];
  const L = inv.labels;
  const money = inv.money;

  const pages = [];
  let page = new XptPage();
  pages.push(page);
  let y = 0;

  const COL = {
    idx: M, desc: M + 24, descW: 240,
    qty: 358, unit: 455, amount: W - M
  };

  function tableHeader() {
    page.rect(M, y, W - 2 * M, 20, accent);
    const ty = y + 14;
    const white = [1, 1, 1];
    page.text(COL.idx + 2, ty, '#', { bold: true, color: white });
    page.text(COL.desc, ty, L.description, { bold: true, color: white });
    page.text(COL.qty, ty, L.quantity, { bold: true, color: white, align: 'right' });
    page.text(COL.unit, ty, L.unitPrice, { bold: true, color: white, align: 'right' });
    page.text(COL.amount - 2, ty, L.amount, { bold: true, color: white, align: 'right' });
    y += 26;
  }

  function newPage() {
    page = new XptPage();
    pages.push(page);
    y = 46;
    tableHeader();
  }

  // -- header band --
  page.rect(0, 0, W, 6, accent);
  y = 30;
  let textX = M;
  if (inv.logo) {
    const maxH = 52;
    const scale = Math.min(maxH / inv.logo.h, 140 / inv.logo.w);
    const lw = inv.logo.w * scale, lh = inv.logo.h * scale;
    page.image(M, y - 6, lw, lh);
    textX = M + lw + 12;
  }
  page.text(textX, y + 10, inv.business.name, { bold: true, size: 15, color: ink });
  let by = y + 24;
  inv.business.addressLines.forEach((line) => {
    page.text(textX, by, line, { size: 8.5, color: gray }); by += 11;
  });
  const contactBits = [inv.business.phone, inv.business.email].filter(Boolean).join('   ');
  if (contactBits) { page.text(textX, by, contactBits, { size: 8.5, color: gray }); by += 11; }
  const taxBits = [
    inv.business.tin ? 'TIN: ' + inv.business.tin : '',
    inv.business.vrn ? 'VRN: ' + inv.business.vrn : ''
  ].filter(Boolean).join('   ');
  if (taxBits) { page.text(textX, by, taxBits, { size: 8.5, color: gray }); by += 11; }

  page.text(W - M, y + 14, L.invoice.toUpperCase(), { bold: true, size: 24, color: accent, align: 'right' });
  page.text(W - M, y + 30, inv.number, { size: 11, color: ink, align: 'right', bold: true });

  y = Math.max(by, y + 44) + 14;

  // -- meta block --
  page.line(M, y - 8, W - M, y - 8, [0.88, 0.89, 0.9], 1);
  page.text(M, y + 4, L.customerName + ':', { size: 8.5, color: gray });
  page.text(M, y + 18, inv.customer.name || '-', { bold: true, size: 11 });
  if (inv.customer.phone) page.text(M, y + 31, inv.customer.phone, { size: 9, color: gray });
  page.text(W - M - 130, y + 4, L.dateLbl + ':', { size: 8.5, color: gray });
  page.text(W - M, y + 4, inv.dateStr, { size: 9, align: 'right' });
  page.text(W - M - 130, y + 18, L.servedBy + ':', { size: 8.5, color: gray });
  page.text(W - M, y + 18, inv.servedBy, { size: 9, align: 'right' });
  y += 48;

  // -- table --
  tableHeader();
  inv.lines.forEach((line, i) => {
    const wrapped = xptWrapText(line.desc, 9, COL.descW);
    const rowH = Math.max(18, wrapped.length * 11 + 7);
    if (y + rowH > XPT_PDF_A4.h - 150) newPage();
    if (i % 2 === 1) page.rect(M, y - 4, W - 2 * M, rowH, lightRow);
    const ty = y + 8;
    page.text(COL.idx + 2, ty, String(i + 1), { color: gray });
    wrapped.forEach((wl, wi) => page.text(COL.desc, ty + wi * 11, wl, {}));
    page.text(COL.qty, ty, String(line.qty), { align: 'right' });
    page.text(COL.unit, ty, money(line.unit), { align: 'right' });
    page.text(COL.amount - 2, ty, money(line.total), { align: 'right', bold: true });
    y += rowH;
  });

  // -- totals --
  if (y > XPT_PDF_A4.h - 190) newPage();
  y += 8;
  const totX = W - M - 200;
  const put = (label, value, opts) => {
    const o = opts || {};
    page.text(totX, y, label, { size: o.big ? 11 : 9, bold: o.big, color: o.big ? ink : gray });
    page.text(W - M - 2, y, value, { size: o.big ? 12 : 9, bold: true, align: 'right', color: o.color || ink });
    y += o.big ? 20 : 15;
  };
  put(L.subtotal, money(inv.subtotal));
  if (inv.discount > 0) put(L.discountLbl, '-' + money(inv.discount));
  if (inv.vatRate > 0) put(L.vatLbl + ' (' + inv.vatRate + '%)', money(inv.vatAmount));
  page.line(totX, y - 4, W - M, y - 4, accent, 1.5);
  y += 6;
  put(L.grandTotal, money(inv.grandTotal), { big: true, color: accent });

  // -- footer --
  y += 18;
  if (inv.terms) {
    xptWrapText(inv.terms, 9, W - 2 * M).forEach((line) => {
      page.text(M, y, line, { size: 9, color: gray }); y += 12;
    });
  }

  // Free-tier watermark: light diagonal text drawn last (on top) on every page — opt-in
  // via inv.watermark so the Chrome extension, which never sets it, is unaffected.
  if (inv.watermark) {
    const label = inv.watermarkText || 'FREE PLAN';
    pages.forEach((p) => {
      p.text(W / 2 - 150, XPT_PDF_A4.h / 2 + 30, label, {
        size: 30, bold: true, rotate: 35, color: [0.84, 0.85, 0.88]
      });
    });
  }

  return xptAssemblePdf(pages, inv.logo);
}

// Node export for tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { xptBuildInvoicePdf, xptWrapText, xptTextWidth, xptAssemblePdf };
}
