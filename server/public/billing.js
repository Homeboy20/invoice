pdRequireAuth();

const $ = (id) => document.getElementById(id);
const CLICKPESA_REF_KEY = 'printdesk_pending_clickpesa_ref';

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderPlanCard(data) {
  const card = $('planCard');
  card.textContent = '';
  const badge = document.createElement('p');
  badge.style.cssText = 'font-size:15px;font-weight:800' + (data.isPremium ? ';color:var(--ok)' : '');
  badge.textContent = data.isPremium ? '✓ Premium' : 'Free plan';
  card.appendChild(badge);
  if (data.premiumUntil) {
    const note = document.createElement('p');
    note.className = 'mutedNote';
    note.textContent = (data.isPremium ? 'Active until ' : 'Expired ') + fmtDate(data.premiumUntil);
    card.appendChild(note);
  }

  $('invoiceUsage').textContent = data.invoiceUsage.used + ' / ' + (data.isPremium ? 'unlimited' : data.invoiceUsage.limit);
  $('staffUsage').textContent = data.staffUsage.used + ' / ' + (data.isPremium ? 'unlimited' : data.staffUsage.limit);
  $('watermarkNote').textContent = data.isPremium ? 'Off' : 'On (pay to remove)';
  $('priceLabel').textContent = data.priceLabel;

  $('paypalBtn').disabled = !data.paypalConfigured;
  $('clickpesaBtn').disabled = !data.clickpesaConfigured;
  $('notConfiguredNote').style.display = (data.paypalConfigured || data.clickpesaConfigured) ? 'none' : '';
}

function renderHistory(payments) {
  const ul = $('paymentHistory');
  ul.textContent = '';
  if (!payments.length) {
    const li = document.createElement('li');
    li.textContent = 'No payments yet.';
    ul.appendChild(li);
    return;
  }
  payments.forEach((p) => {
    const li = document.createElement('li');
    const desc = document.createElement('span');
    desc.textContent = fmtDate(p.created_at) + ' — ' + p.provider + ' (+' + p.days_added + ' days)';
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = p.amount + ' ' + p.currency;
    li.append(desc, amt);
    ul.appendChild(li);
  });
}

async function loadPlan() {
  const [plan, history] = await Promise.all([pdApi('/billing/plan'), pdApi('/billing/history')]);
  renderPlanCard(plan);
  renderHistory(history.payments);
  return plan;
}

async function startPayPal() {
  $('err').textContent = '';
  $('paypalBtn').disabled = true;
  try {
    const { approveUrl } = await pdApi('/billing/paypal/create-order', { method: 'POST' });
    location.href = approveUrl;
  } catch (e) {
    $('err').textContent = e.message;
    $('paypalBtn').disabled = false;
  }
}

async function finishPayPal(orderId) {
  $('err').style.color = '';
  $('err').textContent = 'Confirming your PayPal payment…';
  try {
    const data = await pdApi('/billing/paypal/capture-order', { method: 'POST', body: { orderId } });
    renderPlanCard(data);
    $('err').style.color = 'var(--ok)';
    $('err').textContent = 'Payment confirmed — Premium active until ' + fmtDate(data.premiumUntil) + '.';
    const historyData = await pdApi('/billing/history');
    renderHistory(historyData.payments);
  } catch (e) {
    $('err').style.color = '';
    $('err').textContent = e.message;
  }
  window.history.pushState(null, '', 'billing.html');
}

async function startClickPesa() {
  $('err').textContent = '';
  $('clickpesaBtn').disabled = true;
  try {
    const { reference, checkoutUrl } = await pdApi('/billing/clickpesa/create-order', { method: 'POST' });
    localStorage.setItem(CLICKPESA_REF_KEY, reference);
    location.href = checkoutUrl;
  } catch (e) {
    $('err').textContent = e.message;
    $('clickpesaBtn').disabled = false;
  }
}

async function checkClickPesa(reference, opts) {
  const silent = opts && opts.silent;
  if (!silent) { $('err').textContent = ''; $('clickpesaRecheck').disabled = true; }
  try {
    const data = await pdApi('/billing/clickpesa/status?reference=' + encodeURIComponent(reference));
    renderPlanCard(data);
    if (data.paid) {
      localStorage.removeItem(CLICKPESA_REF_KEY);
      $('clickpesaPending').style.display = 'none';
      $('err').style.color = 'var(--ok)';
      $('err').textContent = 'Payment confirmed — Premium active until ' + fmtDate(data.premiumUntil) + '.';
      const historyData = await pdApi('/billing/history');
      renderHistory(historyData.payments);
    } else {
      $('clickpesaPending').style.display = '';
      if (!silent) { $('err').style.color = ''; $('err').textContent = 'Not confirmed yet — mobile money payments can take a minute.'; }
    }
  } catch (e) {
    if (!silent) { $('err').style.color = ''; $('err').textContent = e.message; }
  } finally {
    $('clickpesaRecheck').disabled = false;
  }
}

(async function init() {
  const me = await pdApi('/me');
  pdRenderHeader(me.business);

  await loadPlan();

  const params = new URLSearchParams(location.search);
  if (params.get('paypal') === 'return' && params.get('token')) {
    await finishPayPal(params.get('token'));
  } else if (params.get('paypal') === 'cancel') {
    $('err').textContent = 'PayPal checkout cancelled — you are still on the Free plan.';
    history.pushState(null, '', 'billing.html');
  }

  const pendingRef = localStorage.getItem(CLICKPESA_REF_KEY);
  if (pendingRef) {
    $('clickpesaPending').style.display = '';
    checkClickPesa(pendingRef, { silent: true });
  }

  $('paypalBtn').addEventListener('click', startPayPal);
  $('clickpesaBtn').addEventListener('click', startClickPesa);
  $('clickpesaRecheck').addEventListener('click', () => checkClickPesa(localStorage.getItem(CLICKPESA_REF_KEY)));
})();
