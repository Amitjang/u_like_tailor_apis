// Staff login ka password: scrypt (Node ka built-in) se hash. Plain password kabhi save nahi hota.
const crypto = require('crypto');

const N = 16384;
const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N }).toString('base64');
  return `scrypt$${N}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const [, n, salt, hash] = parts;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(password), salt, want.length, { N: Number(n) });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Kam se kam 6 akshar; bahut lamba nahi
function passwordOk(p) {
  return typeof p === 'string' && p.length >= 6 && p.length <= 64;
}

module.exports = { hashPassword, verifyPassword, passwordOk };
