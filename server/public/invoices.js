pdRequireAuth();

const $ = (id) => document.getElementById(id);
let business, staff;
const items = []; // {desc, qty, unit}

function money(n) { return pdMoney(n, business.currency); }

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
    desc.placeholder = 'e.g. Banner 2m x 1m';
    desc.addEventListener('input', () => { it.desc = desc.value; });
    tdDesc.appendChild(desc);

    const tdQty = document.createElement('td');
    const qty = document.createElement('input');
    qty.type = 'number'; qty.min = '1'; qty.value = it.qty;
    qty.addEventListener('input', () => {
      it.qty = Math.max(1, parseInt(qty.value, 10) || 1);
      renderTotals(); amt.textContent = money(it.qty * it.unit);
    });
    tdQty.appendChild(qty);

    const tdUnit = document.createElement('td');
    const unit = document.createElement('input');
    unit.type = 'number'; unit.min = '0'; unit.value = it.unit;
    unit.addEventListener('input', () => {
      it.unit = Math.max(0, parseFloat(unit.value) || 0);
      renderTotals(); amt.textContent = money(it.qty * it.unit);
    });
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

function resetForm() {
  $('custName').value = '';
  $('custPhone').value = '';
  $('discount').value = 0;
  $('vatRate').value = business.vatEnabled ? business.vatRate : 0;
  $('err').textContent = '';
  items.length = 0;
  addItem();
}

function renderHistory(invoices) {
  const ul = $('historyList');
  ul.textContent = '';
  if (!invoices.length) {
    const li = document.createElement('li');
    li.textContent = 'No invoices yet.';
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
    const dl = document.createElement('button');
    dl.textContent = 'PDF';
    dl.style.color = 'var(--accent)';
    dl.addEventListener('click', () => downloadExistingPdf(inv));
    li.append(desc, amt, dl);
    ul.appendChild(li);
  });
}

async function downloadBlobPdf(path, filename) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + pdToken() } });
  if (!res.ok) throw new Error('Could not generate PDF');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function downloadExistingPdf(inv) {
  downloadBlobPdf('/invoices/' + inv.id + '/pdf', inv.number + '.pdf').catch((e) => alert(e.message));
}

async function saveAndDownload() {
  const err = $('err');
  err.textContent = '';
  if (!items.some((it) => it.desc.trim())) { err.textContent = 'Add at least one item.'; return; }
  const btn = $('saveInvoice');
  btn.disabled = true;
  try {
    const res = await pdApi('/invoices', {
      method: 'POST',
      body: {
        customerName: $('custName').value,
        customerPhone: $('custPhone').value,
        servedByUserId: $('servedBy').value,
        lines: items.filter((it) => it.desc.trim()),
        discount: parseFloat($('discount').value) || 0,
        vatRate: parseFloat($('vatRate').value) || 0
      }
    });
    await downloadBlobPdf('/invoices/' + res.invoice.id + '/pdf', res.invoice.number + '.pdf');
    const msg = $('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
    resetForm();
    await loadHistory();
  } catch (e) {
    pdShowError(err, e);
  } finally {
    btn.disabled = false;
  }
}

async function loadHistory() {
  const { invoices } = await pdApi('/invoices?limit=50');
  renderHistory(invoices);
}

(async function init() {
  const me = await pdApi('/me');
  business = me.business;
  staff = me.staff;
  pdRenderHeader(business);

  const sel = $('servedBy');
  staff.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    sel.appendChild(opt);
  });

  resetForm();
  await loadHistory();

  $('addItem').addEventListener('click', () => addItem());
  $('discount').addEventListener('input', renderTotals);
  $('vatRate').addEventListener('input', renderTotals);
  $('saveInvoice').addEventListener('click', saveAndDownload);
  $('newInvoice').addEventListener('click', resetForm);
})();
