pdaRequireAuth();

const $ = (id) => document.getElementById(id);

function renderStats(s) {
  const revenueLine = s.revenueByCurrency.length
    ? s.revenueByCurrency.map((r) => pdaMoney(r.total, r.currency)).join(' + ')
    : '0';
  const cards = [
    [s.totalBusinesses, 'Total businesses'],
    [s.premiumCount, 'Premium'],
    [s.freeCount, 'Free'],
    [s.totalInvoices, 'Invoices (all time)'],
    [s.invoicesLast30d, 'Invoices (30d)'],
    [revenueLine, 'Revenue collected']
  ];
  const grid = $('stats');
  grid.textContent = '';
  cards.forEach(([n, l]) => {
    const div = document.createElement('div');
    div.className = 'stat';
    const nEl = document.createElement('div'); nEl.className = 'n'; nEl.textContent = n;
    const lEl = document.createElement('div'); lEl.className = 'l'; lEl.textContent = l;
    div.append(nEl, lEl);
    grid.appendChild(div);
  });
}

async function loadStats() {
  renderStats(await pdaApi('/stats'));
}

function renderBusinesses(list) {
  const tbody = $('bizRows');
  tbody.textContent = '';
  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7; td.textContent = 'No businesses match.'; td.className = 'mutedNote';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((b) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    const nameEl = document.createElement('div');
    nameEl.style.fontWeight = '700';
    nameEl.textContent = b.name;
    const emailEl = document.createElement('div');
    emailEl.className = 'mutedNote';
    emailEl.textContent = b.email;
    tdName.append(nameEl, emailEl);

    const tdPlan = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill ' + (b.isPremium ? 'premium' : 'free');
    pill.textContent = b.isPremium ? 'Premium' : 'Free';
    tdPlan.appendChild(pill);

    const tdUntil = document.createElement('td');
    tdUntil.textContent = pdaDate(b.premiumUntil);

    const tdInv = document.createElement('td'); tdInv.textContent = b.invoiceCount;
    const tdStaff = document.createElement('td'); tdStaff.textContent = b.staffCount;
    const tdJoined = document.createElement('td'); tdJoined.textContent = pdaDate(b.createdAt);

    const tdActions = document.createElement('td');
    const compBtn = document.createElement('button');
    compBtn.className = 'ghost';
    compBtn.textContent = 'Comp 30d';
    compBtn.addEventListener('click', () => compBusiness(b.id));
    tdActions.appendChild(compBtn);
    if (b.isPremium) {
      const downBtn = document.createElement('button');
      downBtn.className = 'ghost';
      downBtn.style.marginLeft = '6px';
      downBtn.style.color = 'var(--bad)';
      downBtn.textContent = 'Downgrade';
      downBtn.addEventListener('click', () => downgradeBusiness(b.id));
      tdActions.appendChild(downBtn);
    }

    tr.append(tdName, tdPlan, tdUntil, tdInv, tdStaff, tdJoined, tdActions);
    tbody.appendChild(tr);
  });
}

async function loadBusinesses() {
  $('bizErr').textContent = '';
  try {
    const { businesses } = await pdaApi('/businesses?search=' + encodeURIComponent($('search').value));
    renderBusinesses(businesses);
  } catch (e) {
    $('bizErr').textContent = e.message;
  }
}

async function compBusiness(id) {
  try {
    await pdaApi('/businesses/' + id + '/comp', { method: 'POST', body: { days: 30 } });
    await Promise.all([loadBusinesses(), loadStats()]);
  } catch (e) {
    $('bizErr').textContent = e.message;
  }
}

async function downgradeBusiness(id) {
  if (!confirm('Downgrade this business to Free immediately?')) return;
  try {
    await pdaApi('/businesses/' + id + '/downgrade', { method: 'POST' });
    await Promise.all([loadBusinesses(), loadStats()]);
  } catch (e) {
    $('bizErr').textContent = e.message;
  }
}

function renderPayments(list) {
  const tbody = $('paymentRows');
  tbody.textContent = '';
  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5; td.textContent = 'No payments yet.'; td.className = 'mutedNote';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((p) => {
    const tr = document.createElement('tr');
    [pdaDate(p.created_at), p.business_name, p.provider, pdaMoney(p.amount, p.currency), p.days_added]
      .forEach((v) => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });
}

async function loadPayments() {
  const { payments } = await pdaApi('/payments');
  renderPayments(payments);
}

(function init() {
  $('logoutBtn').addEventListener('click', pdaLogout);
  $('search').addEventListener('input', () => {
    clearTimeout(window.__pdaSearchTimer);
    window.__pdaSearchTimer = setTimeout(loadBusinesses, 250);
  });
  loadStats();
  loadBusinesses();
  loadPayments();
})();
