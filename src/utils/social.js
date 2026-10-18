// Google / Apple login: app se aaya idToken check karna.
// Google aur Apple apni public keys (JWKS) dete hain — unse token ka signature, issuer,
// audience (hamari app) aur expiry check hoti hai. Koi extra package nahi chahiye.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // url -> { at, keys: Map(kid -> KeyObject) }

async function loadKeys(url, force = false) {
  const c = cache.get(url);
  if (!force && c && Date.now() - c.at < CACHE_MS) return c.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`keys ${url}: HTTP ${res.status}`);
  const body = await res.json();
  const keys = new Map();
  for (const k of body.keys || []) {
    if (k.kty === 'RSA' && k.kid) keys.set(k.kid, crypto.createPublicKey({ key: k, format: 'jwk' }));
  }
  cache.set(url, { at: Date.now(), keys });
  return keys;
}

// Galat token par null (koi detail bahar nahi)
async function verifyIdToken(token, { keysUrl, issuers, audiences }) {
  if (!token || typeof token !== 'string' || !audiences.length) return null;
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded && decoded.header && decoded.header.kid;
  if (!kid) return null;
  let keys = await loadKeys(keysUrl);
  if (!keys.has(kid)) keys = await loadKeys(keysUrl, true); // keys badal gayi hon
  const key = keys.get(kid);
  if (!key) return null;
  try {
    return jwt.verify(token, key, { algorithms: ['RS256'], issuer: issuers, audience: audiences });
  } catch (e) {
    return null;
  }
}

const truthy = (v) => v === true || v === 'true';

// -> { sub, email, emailVerified, name } ya null
async function verifyGoogle(cfg, idToken) {
  const p = await verifyIdToken(idToken, {
    keysUrl: cfg.googleCertsUrl,
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    audiences: cfg.googleClientIds,
  });
  if (!p || !p.sub) return null;
  return { sub: String(p.sub), email: p.email ? String(p.email).toLowerCase() : null, emailVerified: truthy(p.email_verified), name: p.name || null };
}

// Apple naam token mein nahi deta (sirf pehli baar app ko) — isliye naam app body mein bhejti hai
async function verifyApple(cfg, idToken) {
  const p = await verifyIdToken(idToken, {
    keysUrl: cfg.appleKeysUrl,
    issuers: ['https://appleid.apple.com'],
    audiences: cfg.appleClientIds,
  });
  if (!p || !p.sub) return null;
  return { sub: String(p.sub), email: p.email ? String(p.email).toLowerCase() : null, emailVerified: truthy(p.email_verified), name: null };
}

module.exports = { verifyGoogle, verifyApple, verifyIdToken, _cache: cache };
