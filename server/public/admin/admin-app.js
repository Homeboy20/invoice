// Shared helpers for the platform admin panel — deliberately separate from ../app.js:
// admin sessions use their own token/localStorage key so an operator testing a tenant
// account and the admin panel in the same browser never collide or leak into each other.

const PDA_TOKEN_KEY = 'printdesk_admin_token';

function pdaToken() { return localStorage.getItem(PDA_TOKEN_KEY); }
function pdaSetToken(t) { localStorage.setItem(PDA_TOKEN_KEY, t); }
function pdaLogout() { localStorage.removeItem(PDA_TOKEN_KEY); location.href = 'login.html'; }

function pdaRequireAuth() {
  if (!pdaToken()) { location.href = 'login.html'; throw new Error('redirecting'); }
}

async function pdaApi(path, opts) {
  const o = opts || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
  if (pdaToken()) headers.Authorization = 'Bearer ' + pdaToken();
  const res = await fetch('/api/admin' + path, {
    method: o.method || 'GET',
    headers,
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  if (res.status === 401) { pdaLogout(); throw new Error('Not authenticated'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function pdaMoney(amount, currency) {
  return Math.round(amount).toLocaleString('en-US') + ' ' + (currency || '');
}

function pdaDate(ms) {
  return ms ? new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
