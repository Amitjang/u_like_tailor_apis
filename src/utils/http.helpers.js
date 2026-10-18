// Response, error aur request helpers.
const i18n = require('./i18n');
const { isDateStr } = require('./dates');

// Error ka standard format:
//   {"success":false,"message":"ऑर्डर नहीं मिला","error":{"code":"not_found","key":"order_not_found","message":"ऑर्डर नहीं मिला"}}
// code = HTTP category, key = exact wajah (app chahe to apna text dikhaye),
// message = user ki bhasha (English/Hindi) mein.
class ApiError extends Error {
  constructor(status, code, key, args = []) {
    super(i18n.t('en', key, ...args.map((a) => (a instanceof MsgKey ? i18n.t('en', a.key) : a))));
    this.status = status;
    this.code = code;
    this.key = key;
    this.args = args;
  }
}

// Error ke argument mein translate hone wala shabd (jaise "limit_customers")
class MsgKey {
  constructor(key) { this.key = key; }
}
const msgKey = (k) => new MsgKey(k);

const bad = (key, ...a) => new ApiError(400, 'bad_request', key, a);
const notFound = (key = 'not_found', ...a) => new ApiError(404, 'not_found', key, a);
const forbidden = (key, ...a) => new ApiError(403, 'forbidden', key, a);
const conflict = (key, ...a) => new ApiError(409, 'conflict', key, a);
const unauth = (key, ...a) => new ApiError(401, 'unauthorized', key, a);
const limit = (key, ...a) => new ApiError(402, 'plan_limit', key, a);
const tooMany = (key, ...a) => new ApiError(429, 'too_many_requests', key, a);

// MongoDB / Mongoose errors ko API error mein badlo
function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err && err.code === 11000) {
    const detail = Object.keys(err.keyPattern || err.keyValue || {}).join(', ');
    return new ApiError(409, 'already_exists', 'already_exists', [detail]);
  }
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    const detail = first ? `${first.path}: ${first.kind === 'enum' ? 'value not allowed' : first.kind}` : 'invalid';
    return new ApiError(400, 'invalid_value', 'invalid_value', [detail]);
  }
  if (err && (err.name === 'CastError' || err.name === 'StrictModeError')) {
    return new ApiError(400, 'invalid_value', 'invalid_value', [err.path || err.message]);
  }
  if (err && err.type === 'entity.parse.failed') return bad('json_invalid', err.message);
  return null;
}

// Mongo documents ko saaf JSON: _id -> id, ObjectId -> string
function clean(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(clean);
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (typeof v.toObject === 'function' && v.$__ !== undefined) return clean(v.toObject());
    if (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID') return v.toString();
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === '__v') continue;
      out[k === '_id' ? 'id' : k] = clean(val);
    }
    return out;
  }
  return v;
}

// ======================= RESPONSE ENVELOPE =======================
// Har JSON response ek hi shape mein:
//   Success: {"success":true,  "message":"सफल", "data":<payload>}
//   Error:   {"success":false, "message":"ऑर्डर नहीं मिला", "error":{"code","key","message"}}
// message user ki bhasha (Content-Language) mein.
function langOf(res) {
  return i18n.parse(res.get('Content-Language')) || (res.req && res.req.lang) || i18n.DEFAULT;
}

function send(res, status, data, msgKeyName) {
  return res.status(status).json({ success: true, message: i18n.t(langOf(res), msgKeyName), data: clean(data) });
}

const ok = (res, data) => send(res, 200, data, 'ok');
const created = (res, data) => send(res, 201, data, 'created');

// Error envelope (error handler aur 404 dono yahi use karte hain)
function sendError(res, status, { code, key, message }) {
  return res.status(status).json({ success: false, message, error: { code, key, message } });
}

// async route handler -> errors Express ke error handler tak
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Body se sirf allowed fields
function pick(body, allowed) {
  const out = {};
  for (const k of allowed) if (body && Object.prototype.hasOwnProperty.call(body, k)) out[k] = body[k];
  return out;
}

function paging(req) {
  let limit = parseInt(req.query.limit, 10);
  if (!(limit > 0)) limit = 50;
  limit = Math.min(limit, 200);
  let offset = parseInt(req.query.offset, 10);
  if (!(offset > 0)) offset = 0;
  return { limit, offset };
}

// ?from=2026-10-01 -> "2026-10-01" / null; galat format par 400
function queryDate(req, name) {
  const v = req.query[name];
  if (v === undefined || v === '') return null;
  if (!isDateStr(v)) throw bad('date_format', name);
  return v;
}

function bodyDate(v, name) {
  if (v === undefined || v === null || v === '') return null;
  if (!isDateStr(v)) throw bad('date_format', name);
  return v;
}

function requireBody(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw bad('body_empty');
  return req.body;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { ApiError, msgKey, MsgKey, bad, notFound, forbidden, conflict, unauth, limit, tooMany, toApiError, clean, ok, created, sendError, h, pick, paging, queryDate, bodyDate, requireBody, escapeRegex };
