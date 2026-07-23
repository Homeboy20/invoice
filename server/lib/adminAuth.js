// Platform-owner auth — separate from tenant auth (lib/auth.js). One shared operator
// password (ADMIN_PASSWORD env var), not a per-tenant `businesses` row: this panel
// manages the whole PrintDesk business, not any one print shop's account.

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { JWT_SECRET } = require('./auth');

const ADMIN_TOKEN_TTL = '12h'; // shorter than tenant sessions — this panel sees every business

function isConfigured() {
  return !!process.env.ADMIN_PASSWORD;
}

// Fixed-length digest comparison so timingSafeEqual never throws on a length mismatch
// (which would otherwise leak the real password's length) and runs in constant time.
function checkPassword(candidate) {
  if (!isConfigured()) return false;
  const a = crypto.createHash('sha256').update(String(candidate || '')).digest();
  const b = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function issueAdminToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: ADMIN_TOKEN_TTL });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('not an admin token');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

module.exports = { isConfigured, checkPassword, issueAdminToken, requireAdmin };
