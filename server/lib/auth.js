// JWT issuing/verification and an Express middleware that scopes every request
// to req.businessId — the tenant boundary for every route below.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TOKEN_TTL = '30d';

function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

function issueToken(businessId) {
  return jwt.sign({ businessId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // An admin token (see lib/adminAuth.js) is a different shape — reject it explicitly
    // rather than falling through with req.businessId undefined.
    if (!payload.businessId) throw new Error('not a business token');
    req.businessId = payload.businessId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { hashPassword, verifyPassword, issueToken, requireAuth, JWT_SECRET };
