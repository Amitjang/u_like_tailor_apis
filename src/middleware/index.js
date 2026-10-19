const i18n = require('../utils/i18n');
const { User, Session, Shop, Customer, Order, Staff } = require('../models');
const { parseAccess } = require('../utils/auth');
const { unauth, forbidden, limit, msgKey, h } = require('../utils/http.helpers');
const { limitsOf, planOf } = require('../utils/plans');
const { monthStartIST } = require('../utils/dates');
const permissions = require('../utils/permissions');

// ======================= BHASHA (LANGUAGE) =======================
// Har request ki bhasha is kram mein:
//   1. ?lang=en / ?lang=hi            (sirf is request ke liye)
//   2. X-Language: en / hi header     (app har request mein bhej sakta hai)
//   3. User ki saved preference       (PATCH /api/auth/me {"preferredLanguage":"en"})
//   4. Accept-Language header         (phone ki bhasha)
//   5. Default: Hindi
// Customer ko WhatsApp hamesha CUSTOMER ki bhasha mein jaata hai, darzi ki app-bhasha se nahi.
function language(req, res, next) {
  const explicit = i18n.parse(req.query.lang) || i18n.parse(req.get('X-Language'));
  const accept = i18n.fromAcceptLanguage(req.get('Accept-Language'));
  req.langExplicit = explicit;
  req.langHint = explicit || accept; // naye user ki bhasha
  req.lang = explicit || accept || i18n.DEFAULT;
  res.set('Content-Language', req.lang);
  res.vary('Accept-Language');
  res.vary('X-Language');
  next();
}

// Login ke baad user ki saved bhasha (agar request mein khud nahi di)
function applyUserLang(req, res, saved) {
  const l = i18n.parse(saved);
  if (!req.langExplicit && l) {
    req.lang = l;
    res.set('Content-Language', l);
  }
}

// ======================= LOGIN =======================
const requireAuth = h(async (req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) throw unauth('login_required');
  const claims = parseAccess(req.app.locals.cfg.jwtSecret, m[1]);
  if (!claims) throw unauth('token_invalid');
  // Logout ke baad purana token turant band
  const [session, user] = await Promise.all([
    Session.findOne({ _id: claims.sessionId, userId: claims.userId, revokedAt: null, expiresAt: { $gt: new Date() } }).lean(),
    User.findById(claims.userId).lean(),
  ]);
  if (!session || !user || !user.isActive) throw unauth('session_expired');
  req.user = user;
  req.sessionId = session._id;
  applyUserLang(req, res, user.preferredLanguage);
  next();
});

// ======================= DUKAAN =======================
// Dukaan ke andar wale saare APIs: header "X-Shop-Id: <shopId>" (ya ?shopId=).
// User us dukaan ka active member hona chahiye.
const requireShop = h(async (req, res, next) => {
  const shopId = req.get('X-Shop-Id') || req.query.shopId;
  if (!shopId) throw forbidden('shop_id_required');
  const shop = await Shop.findOne({ _id: String(shopId), deletedAt: null }).lean();
  const member = shop && (shop.members || []).find((x) => x.userId === req.user._id && x.isActive);
  if (!member) throw forbidden('not_shop_member');
  req.shop = shop;
  req.shopId = shop._id;
  req.role = member.role;
  req.member = member;
  req.perms = permissions.effective(member); // { orders_view: true, payments: false, ... }
  next();
});

// Staff ke liye maalik ki di hui permission (owner/manager ko hamesha). Koi ek bhi key ho to chalega.
function requirePerm(...keys) {
  return (req, res, next) => {
    if (req.role === 'owner' || req.role === 'manager') return next();
    if (keys.some((k) => req.perms && req.perms[k])) return next();
    next(forbidden('permission_denied'));
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.role)) return next();
    const names = roles.map((r) => i18n.t(req.lang, 'role_' + r)).join(' / ');
    next(forbidden('role_required', names));
  };
}

const requireAdmin = (req, res, next) => {
  const { adminPhones, adminEmails } = req.app.locals.cfg;
  if (req.user.phone && adminPhones.includes(req.user.phone)) return next();
  if (req.user.email && (adminEmails || []).includes(String(req.user.email).toLowerCase())) return next();
  next(forbidden('admin_only'));
};

// ======================= PLAN LIMITS =======================
const LIMITS = {
  maxCustomers: { label: 'limit_customers', count: (shopId) => Customer.countDocuments({ shopId, deletedAt: null }) },
  maxOrdersPerMonth: { label: 'limit_orders', count: (shopId) => Order.countDocuments({ shopId, deletedAt: null, orderDate: { $gte: monthStartIST() } }) },
  maxStaff: { label: 'limit_staff', count: (shopId) => Staff.countDocuments({ shopId, deletedAt: null, isActive: true }) },
};

// Limit cross ho rahi ho to 402. null/missing = unlimited.
async function checkLimit(shop, key) {
  const max = (await limitsOf(shop))[key];
  if (typeof max !== 'number') return;
  const n = await LIMITS[key].count(shop._id);
  if (n >= max) throw limit('plan_limit', max, msgKey(LIMITS[key].label));
}

module.exports = { language, applyUserLang, requireAuth, requireShop, requireRole, requirePerm, requireAdmin, checkLimit, planOf };
