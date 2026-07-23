// Minimal input sanitizing shared by all routes — never trust req.body directly.

function str(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen || 500);
}

function email(val) {
  const s = str(val, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function num(val, fallback, min, max) {
  const n = parseFloat(val);
  if (isNaN(n)) return fallback;
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

function int(val, fallback, min) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return fallback;
  return typeof min === 'number' ? Math.max(min, n) : n;
}

module.exports = { str, email, num, int };
