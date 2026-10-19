// Dukaan, team, chalu plan.

const { Shop, User, Plan, Customer, Order, Staff } = require('../models');
const { h, ok, created, bad, notFound, limit, pick, requireBody } = require('../utils/http.helpers');
const { normalizePhone } = require('../utils/phone');
const { requireRole } = require('../middleware');
const { planOf, limitsOf } = require('../utils/plans');
const { monthStartIST } = require('../utils/dates');
const i18n = require('../utils/i18n');
const { profile } = require('./auth.controller');
const permissions = require('../utils/permissions');

// defaultLanguage: "hi" / "en" — naye customers ko WhatsApp isi bhasha mein
const SHOP_FIELDS = ['name', 'phone', 'whatsappPhone', 'address', 'city', 'state', 'pincode', 'logoUrl', 'upiId',
  'gstin', 'invoicePrefix', 'defaultLanguage', 'measurementUnit', 'workingDays', 'settings'];

// Nayi dukaan par yeh automation rules apne aap bante hain
const DEFAULT_RULES = [
  { event: 'order_received', isEnabled: true, offsetMinutes: 0 },
  { event: 'order_ready', isEnabled: true, offsetMinutes: 0 },
  { event: 'payment_received', isEnabled: true, offsetMinutes: 0 },
  { event: 'trial_reminder', isEnabled: true, offsetMinutes: -1440, sendTimeLocal: '10:00' }, // trial se 1 din pehle, 10 baje
  { event: 'delivery_reminder', isEnabled: false, offsetMinutes: -1440, sendTimeLocal: '10:00' },
  { event: 'payment_due', isEnabled: true, offsetMinutes: 4320, sendTimeLocal: '11:00', repeatEveryDays: 7, maxRepeats: 3 }, // ready ke 3 din baad, har 7 din, max 3
  { event: 'birthday', isEnabled: true, offsetMinutes: 0, sendTimeLocal: '09:30' },
  { event: 'anniversary', isEnabled: true, offsetMinutes: 0, sendTimeLocal: '09:30' },
];

function normalizePhones(obj, keys) {
  for (const k of keys) {
    if (obj[k] === undefined || obj[k] === null) continue;
    if (typeof obj[k] !== 'string') throw bad('field_not_text', k);
    if (!obj[k].trim()) { obj[k] = null; continue; }
    const n = normalizePhone(obj[k]);
    if (!n) throw bad('field_invalid', k);
    obj[k] = n;
  }
  return obj;
}

// meri dukaanein
// GET /api/shops
const getMyShops = h(async (req, res) => ok(res, (await profile(req.user._id)).shops));

// defaultLanguage na do to user ki app-bhasha. Free plan apne aap.
// POST /api/shops
const createShop = h(async (req, res) => {
  const body = normalizePhones(pick(requireBody(req), SHOP_FIELDS), ['phone', 'whatsappPhone']);
  if (!body.name) throw bad('shop_name_required');
  if (!body.defaultLanguage) body.defaultLanguage = req.lang;
  const free = await Plan.findOne({ code: 'free' }).lean();
  const shop = await Shop.create({
    ...body,
    ownerUserId: req.user._id,
    members: [{ userId: req.user._id, role: 'owner' }],
    subscription: { planId: free && free._id, planCode: 'free', status: 'active', startsAt: new Date(), endsAt: null, version: 0 },
    automationRules: DEFAULT_RULES,
  });
  created(res, shop);
});

// GET /api/shops/current
const getShop = h(async (req, res) => ok(res, { ...req.shop, myRole: req.role }));

// PATCH /api/shops/current
const updateShop = h(async (req, res) => {
  const set = normalizePhones(pick(requireBody(req), SHOP_FIELDS), ['phone', 'whatsappPhone']);
  if (!Object.keys(set).length) throw bad('no_fields', SHOP_FIELDS.join(', '));
  const shop = await Shop.findByIdAndUpdate(req.shopId, { $set: set }, { new: true, runValidators: true }).lean();
  ok(res, shop);
});

// chalu plan, kitne din bache, usage
async function subscriptionView(shop, lang) {
  const plan = await planOf(shop);
  const sub = shop.subscription || {};
  const endsAt = sub.endsAt ? new Date(sub.endsAt) : null;
  const [customers, ordersThisMonth, staff] = await Promise.all([
    Customer.countDocuments({ shopId: shop._id, deletedAt: null }),
    Order.countDocuments({ shopId: shop._id, deletedAt: null, orderDate: { $gte: monthStartIST() } }),
    Staff.countDocuments({ shopId: shop._id, deletedAt: null, isActive: true }),
  ]);
  return {
    subscription: sub,
    plan: { ...plan, displayName: i18n.pick(lang, plan.name, plan.nameHi) },
    isPaidPlan: plan.pricePaise > 0,
    endsAt,
    daysLeft: endsAt ? Math.max(Math.ceil((endsAt - Date.now()) / 86400000), 0) : null,
    expiringSoon: !!endsAt && endsAt - Date.now() < 3 * 86400000,
    usage: { customers, ordersThisMonth, staff },
  };
}
// GET /api/shops/subscription
const getSubscription = h(async (req, res) => ok(res, await subscriptionView(req.shop, req.lang)));

// ---------- Team (app login wale log) ----------
// GET /api/shops/team
const getTeam = h(async (req, res) => {
  const users = await User.find({ _id: { $in: req.shop.members.map((m) => m.userId) } }).lean();
  const byId = new Map(users.map((u) => [u._id, u]));
  ok(res, req.shop.members.map((m) => {
    const u = byId.get(m.userId) || {};
    return { id: m._id, role: m.role, isActive: m.isActive, permissions: m.permissions, createdAt: m.createdAt,
      userId: m.userId, name: u.name, phone: u.phone || u.loginPhone, email: u.email, preferredLanguage: u.preferredLanguage, lastLoginAt: u.lastLoginAt,
      loginType: u.authType || 'social', // 'password' = maalik ka banaya staff login
      effectivePermissions: permissions.effective(m),
      // false = staff ne abhi tak app mein login karke yahi number nahi joda
      joined: !!(u.googleId || u.appleId || u.lastLoginAt || u.authType === 'password') };
  }));
});

// Body: {"phone","name","role":"manager"|"staff","preferredLanguage"} — Pro plan
// Staff Google/Apple se login karke "apna number jodo" mein YAHI number daale (OTP) — tab wo is dukaan mein aa jaata hai.
// POST /api/shops/team
const addTeamMember = h(async (req, res) => {
  const body = requireBody(req);
  if (!['manager', 'staff'].includes(body.role)) throw bad('team_role_invalid');
  const phone = normalizePhone(body.phone);
  if (!phone) throw bad('phone_invalid');
  let memberLang = req.lang;
  if (body.preferredLanguage !== undefined) {
    memberLang = i18n.parse(body.preferredLanguage);
    if (!memberLang) throw bad('language_invalid');
  }
  if (!(await limitsOf(req.shop)).multiUser) throw limit('team_needs_pro');
  const user = await User.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, name: body.name || undefined, preferredLanguage: memberLang, isActive: true } },
    { upsert: true, new: true },
  ).lean();
  const existing = req.shop.members.find((m) => m.userId === user._id);
  let shop;
  if (existing) {
    shop = await Shop.findOneAndUpdate({ _id: req.shopId, 'members._id': existing._id },
      { $set: { 'members.$.role': body.role, 'members.$.isActive': true } }, { new: true }).lean();
  } else {
    shop = await Shop.findByIdAndUpdate(req.shopId, { $push: { members: { userId: user._id, role: body.role } } }, { new: true }).lean();
  }
  created(res, shop.members.find((m) => m.userId === user._id));
});

// Body: (owner ko hataya nahi ja sakta)
// DELETE /api/shops/team/:memberId
const removeTeamMember = h(async (req, res) => {
  const r = await Shop.updateOne(
    { _id: req.shopId, members: { $elemMatch: { _id: req.params.memberId, role: { $ne: 'owner' } } } },
    { $set: { 'members.$.isActive': false } },
  );
  if (!r.matchedCount) throw notFound('team_member_not_found');
  ok(res, { removed: true });
});

module.exports = {
  getMyShops,
  createShop,
  getShop,
  updateShop,
  getSubscription,
  getTeam,
  addTeamMember,
  removeTeamMember,
  normalizePhones,
  subscriptionView,
  SHOP_FIELDS,
};
