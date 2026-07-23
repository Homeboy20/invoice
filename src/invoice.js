// Invoice builder: line items, totals, PDF download, history, user attribution.

let S;          // settings
let logo = null; // {dataUrl,w,h}
let currentNumber = null;
const items = []; // {desc, qty, unit}

const $ = (id) => document.getElementById(id);

function money(n) { return xptMoney(n, S.currency); }

function totals() {
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit, 0);
  const discount = Math.max(0, parseFloat($('discount').value) || 0);
  const vatRate = Math.max(0, parseFloat($('vatRate').value) || 0);
  const base = Math.max(0, subtotal - discount);
  const vatAmount = base * (vatRate / 100);
  return { subtotal, discount, vatRate, vatAmount, grandTotal: base + vatAmount };
}

function renderTotals() {
  const t = totals();
  $('subtotal').textContent = money(t.subtotal);
  $('vatAmount').textContent = money(t.vatAmount);
  $('grand').textContent = money(t.grandTotal);
}

function renderItems() {
  const tbody = $('itemRows');
  tbody.textContent = '';
  items.forEach((it, i) => {
    const tr = document.createElement('tr');

    const tdDesc = document.createElement('td');
    const desc = document.createElement('input');
    desc.type = 'text';
    desc.value = it.desc;
    desc.placeholder = xptT(S.language, 'itemPlaceholder');
    desc.addEventListener('input', () => { it.desc = desc.value; });
    tdDesc.appendChild(desc);

    const tdQty = document.createElement('td');
    const qty = document.createElement('input');
    qty.type = 'number'; qty.min = '1'; qty.value = it.qty;
    qty.addEventListener('input', () => { it.qty = Math.max(1, parseInt(qty.value, 10) || 1); renderTotals(); amt.textContent = money(it.qty * it.unit); });
    tdQty.appendChild(qty);

    const tdUnit = document.createElement('td');
    const unit = document.createElement('input');
    unit.type = 'number'; unit.min = '0'; unit.value = it.unit;
    unit.addEventListener('input', () => { it.unit = Math.max(0, parseFloat(unit.value) || 0); renderTotals(); amt.textContent = money(it.qty * it.unit); });
    tdUnit.appendChild(unit);

    const tdAmt = document.createElement('td');
    const amt = document.createElement('span');
    amt.textContent = money(it.qty * it.unit);
    tdAmt.appendChild(amt);

    const tdDel = document.createElement('td');
    const del = document.createElement('button');
    del.textContent = '✕';
    del.style.cssText = 'background:none;border:none;color:var(--bad);cursor:pointer';
    del.addEventListener('click', () => { items.splice(i, 1); renderItems(); renderTotals(); });
    tdDel.appendChild(del);

    tr.append(tdDesc, tdQty, tdUnit, tdAmt, tdDel);
    tbody.appendChild(tr);
  });
}

function addItem(desc, qty, unit) {
  items.push({ desc: desc || '', qty: qty || 1, unit: unit || 0 });
  renderItems();
  renderTotals();
}

function buildInvoiceData(numberStr) {
  const t = totals();
  return {
    business: {
      name: S.businessName,
      addressLines: (S.businessAddress || '').split('\n').filter(Boolean),
      phone: S.businessPhone, email: S.businessEmail, tin: S.tin, vrn: S.vrn
    },
    logo,
    accent: S.accentColor,
    number: numberStr,
    dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    servedBy: xptActiveUser(S).name,
    customer: { name: $('custName').value.trim(), phone: $('custPhone').value.trim() },
    currency: S.currency,
    lines: items.filter((it) => it.desc.trim()).map((it) => ({
      desc: it.desc, qty: it.qty, unit: it.unit, total: it.qty * it.unit
    })),
    subtotal: t.subtotal, discount: t.discount,
    vatRate: t.vatRate, vatAmount: t.vatAmount, grandTotal: t.grandTotal,
    terms: S.invoiceTerms,
    labels: {
      invoice: xptT(S.language, 'invoice'),
      description: xptT(S.language, 'description'),
      quantity: xptT(S.language, 'quantity'),
      unitPrice: xptT(S.language, 'unitPrice'),
      amount: xptT(S.language, 'amount'),
      subtotal: xptT(S.language, 'subtotal'),
      discountLbl: xptT(S.language, 'discountLbl'),
      vatLbl: xptT(S.language, 'vatLbl'),
      grandTotal: xptT(S.language, 'grandTotal'),
      customerName: xptT(S.language, 'customerName'),
      dateLbl: xptT(S.language, 'dateLbl'),
      servedBy: xptT(S.language, 'servedBy'),
      invoiceNo: xptT(S.language, 'invoiceNo')
    },
    money
  };
}

async function saveToHistory(data) {
  const stored = await xptLocalGet({ invoices: [] });
  const invoices = stored.invoices || [];
  invoices.unshift({
    number: data.number, dateStr: data.dateStr, servedBy: data.servedBy,
    customer: data.customer, grandTotal: data.grandTotal,
    items: items.map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit })),
    discount: data.discount, vatRate: data.vatRate,
    savedAt: Date.now()
  });
  await xptLocalSet({ invoices: invoices.slice(0, 50) });
  renderHistory(invoices.slice(0, 50));
}

function renderHistory(invoices) {
  const ul = $('historyList');
  ul.textContent = '';
  if (!invoices.length) {
    const li = document.createElement('li');
    li.textContent = xptT(S.language, 'noHistory');
    ul.appendChild(li);
    return;
  }
  invoices.forEach((inv) => {
    const li = document.createElement('li');
    const desc = document.createElement('span');
    desc.textContent = inv.number + ' — ' + (inv.customer.name || '-') + ' (' + inv.dateStr + ', ' + inv.servedBy + ')';
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = money(inv.grandTotal);
    const open = document.createElement('button');
    open.textContent = xptT(S.language, 'reopenInvoice');
    open.style.color = 'var(--accent)';
    open.addEventListener('click', () => loadInvoice(inv));
    li.append(desc, amt, open);
    ul.appendChild(li);
  });
}

function loadInvoice(inv) {
  currentNumber = inv.number;
  $('invNo').textContent = inv.number;
  $('custName').value = inv.customer.name || '';
  $('custPhone').value = inv.customer.phone || '';
  $('discount').value = inv.discount || 0;
  $('vatRate').value = inv.vatRate || 0;
  items.length = 0;
  inv.items.forEach((it) => items.push({ desc: it.desc, qty: it.qty, unit: it.unit }));
  renderItems();
  renderTotals();
  window.scrollTo(0, 0);
}

function resetInvoice() {
  currentNumber = null;
  $('invNo').textContent = '';
  $('custName').value = '';
  $('custPhone').value = '';
  $('discount').value = 0;
  $('vatRate').value = S.vatEnabled ? S.vatRate : 0;
  items.length = 0;
  addItem();
}

async function downloadPdf() {
  if (!items.some((it) => it.desc.trim())) return;
  if (!currentNumber) {
    currentNumber = await xptAllocateInvoiceNumber(S);
    $('invNo').textContent = currentNumber;
  }
  const data = buildInvoiceData(currentNumber);
  const bytes = xptBuildInvoicePdf(data);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = currentNumber + '.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  await saveToHistory(data);
  const msg = $('savedMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
}

(async function init() {
  S = await xptLoadSettings();
  const local = await xptLocalGet({ logo: null, invoices: [], quoteHandoff: null });
  logo = local.logo;
  $('bizName').textContent = S.businessName;
  xptApplyI18n(S.language);

  // user switcher
  const sel = $('userSel');
  S.users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    sel.appendChild(opt);
  });
  sel.value = xptActiveUser(S).id;
  sel.addEventListener('change', async () => {
    S.activeUserId = sel.value;
    await xptSaveSettings({ activeUserId: S.activeUserId });
  });

  resetInvoice();

  // handoff from popup quote?
  if (local.quoteHandoff && Array.isArray(local.quoteHandoff.lines) && local.quoteHandoff.lines.length) {
    items.length = 0;
    local.quoteHandoff.lines.forEach((l) => {
      const detail = l.note ? ' (' + l.note + ')' : '';
      items.push({ desc: l.label + detail, qty: l.qty, unit: l.qty ? l.total / l.qty : l.total });
    });
    renderItems();
    renderTotals();
    await xptLocalSet({ quoteHandoff: null });
  }

  renderHistory(local.invoices || []);

  $('addItem').addEventListener('click', () => addItem());
  $('discount').addEventListener('input', renderTotals);
  $('vatRate').addEventListener('input', renderTotals);
  $('downloadPdf').addEventListener('click', downloadPdf);
  $('newInvoice').addEventListener('click', resetInvoice);
})();
