// OTP, JWT aur refresh token ke helpers.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 6 digit ka random OTP
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// OTP kabhi plain save nahi hota
function hashOtp(secret, phone, otp) {
  return crypto.createHmac('sha256', secret).update(`${phone}:${otp}`).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Client ko token milta hai, DB mein sirf uska hash
function newRefreshToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

function signAccess(secret, userId, sessionId, ttlSeconds) {
  const token = jwt.sign({ sid: sessionId }, secret, {
    subject: userId, expiresIn: ttlSeconds, issuer: 'uliketailor', algorithm: 'HS256',
  });
  return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
}

// Galat / expire token par null
function parseAccess(secret, token) {
  try {
    const c = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'uliketailor' });
    if (!c.sub || !c.sid) return null;
    return { userId: c.sub, sessionId: c.sid };
  } catch {
    return null;
  }
}

function randomToken(bytes = 9) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { generateOtp, hashOtp, safeEqual, sha256, newRefreshToken, signAccess, parseAccess, randomToken };
