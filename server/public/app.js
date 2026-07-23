// Shared client helpers: token storage, authenticated fetch, auth guard.

const PD_TOKEN_KEY = 'printdesk_token';

function pdToken() { return localStorage.getItem(PD_TOKEN_KEY); }
function pdSetToken(t) { localStorage.setItem(PD_TOKEN_KEY, t); }
function pdLogout() { localStorage.removeItem(PD_TOKEN_KEY); location.href = 'login.html'; }

// Redirect to login if there's no token. Call at the top of any protected page.
function pdRequireAuth() {
  if (!pdToken()) { location.href = 'login.html'; throw new Error('redirecting'); }
}

async function pdApi(path, opts) {
  const o = opts || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
  if (pdToken()) headers.Authorization = 'Bearer ' + pdToken();
  const res = await fetch('/api' + path, {
    method: o.method || 'GET',
    headers,
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  if (res.status === 401) { pdLogout(); throw new Error('Not authenticated'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.upgradeRequired = !!data.upgradeRequired;
    throw err;
  }
  return data;
}

// Renders an error message inline, appending an "Upgrade →" link to billing.html when
// the API rejected the request specifically for a free-plan limit (402 upgradeRequired).
function pdShowError(el, err) {
  el.textContent = err.message;
  if (err.upgradeRequired) {
    const link = document.createElement('a');
    link.href = 'billing.html';
    link.textContent = ' Upgrade →';
    link.style.marginLeft = '6px';
    el.appendChild(link);
  }
}

function pdMoney(amount, currency) {
  return Math.round(amount).toLocaleString('en-US') + ' ' + (currency || 'TZS');
}

// Populates the shared header once business info is known.
function pdRenderHeader(business) {
  const nameEl = document.getElementById('bizName');
  if (nameEl) nameEl.textContent = business.name;
  document.querySelectorAll('nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === document.body.dataset.page);
  });
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', pdLogout);
}
