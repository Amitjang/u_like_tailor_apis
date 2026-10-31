// ======================= ADMIN PANEL (web) =======================
// Sirf app ka maalik (aur uske jode admin). Mount: /api/admin (login + requireAdmin).
// Dashboard, saari dukaanein, users, payments, marketplace settings, broadcast, admins, audit log.

const M = require('../models');
const { Shop, User, Session, Plan, SubscriptionPayment, Customer, Order, Staff, Payment, Festival,
  Notification, AdminUser, AdminLog, Broadcast, ADMIN_ROLES } = M;
const { h, ok, created, bad, notFound, forbidden, conflict, pick, paging, queryDate, requireBody, escapeRegex } = require('../utils/http.helpers');
const { loadPlans, clearPlanCache } = require('../utils/plans');
const { istDateTime, addDays, monthStartIST, todayIST } = require('../utils/dates');
const marketplace = require('../utils/marketplace');

const DAY = 86400000;
const TZ = 'Asia/Kolkata';
const rx = (q) => new RegExp(escapeRegex(String(q).trim()), 'i');
const MONTHLY = { monthly: 1, quarterly: 3, yearly: 12 };
// IST mahine ki shuruaat (Date)
const monthStartAt = (now = new Date()) => istDateTime(monthStartIST(now));
// "2026-10" se n mahine pehle / baad
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

// Dukaan ka abhi chalu plan (expire = free)
function liveOf(shop, plans) {
  const sub = shop.subscription || {};
  const p = sub.planId && plans.byId.get(sub.planId);
  const live = !!(p && sub.status === 'active' && (!sub.endsAt || new Date(sub.endsAt) > new Date()));
  const plan = live ? p : plans.free;
  return {
    code: plan ? plan.code : 'free', tier: plan ? plan.tier : 'free', name: plan ? plan.name : 'Free',
    endsAt: live ? sub.endsAt || null : null, live, expiredPlan: !live && p ? p.code : null,
    paid: live && plan && plan.pricePaise > 0,
  };
}

const userBrief = (u) => (u ? { id: u._id, name: u.name || null, email: u.email || null, phone: u.phone || u.loginPhone || null } : null);

async function usersById(ids) {
  const users = await User.find({ _id: { $in: [...new Set(ids.filter(Boolean))] } }).select('name email phone loginPhone').lean();
  return new Map(users.map((u) => [u._id, u]));
}

async function countBy(model, field, ids, extra = {}) {
  const rows = await model.aggregate([{ $match: { [field]: { $in: ids }, deletedAt: null, ...extra } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

// ---------------------------------------------------------------- me
// GET /api/admin/me
const me = h(async (req, res) => ok(res, { ...req.admin, name: req.user.name || null, userId: req.user._id }));

// ---------------------------------------------------------------- dashboard
// GET /api/admin/dashboard
const dashboard = h(async (req, res) => {
  const now = new Date();
  const monthStart = monthStartAt(now);
  const thisMonth = todayIST(now).slice(0, 7);
  const lastMonthStart = istDateTime(shiftMonth(thisMonth, -1) + '-01');
  const plans = await loadPlans();
  const since30 = istDateTime(addDays(todayIST(now), -29));
  const since6m = istDateTime(shiftMonth(thisMonth, -5) + '-01');

  const [shops, usersTotal, usersNew, usersActive7, ordersTotal, ordersMonth, paidRows, signups, revByMonth, recentPays] = await Promise.all([
    Shop.find({ deletedAt: null }).select('name city createdAt subscription blockedAt').lean(),
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: monthStart } }),
    User.countDocuments({ lastLoginAt: { $gte: new Date(now - 7 * DAY) } }),
    Order.countDocuments({ deletedAt: null }),
    Order.countDocuments({ deletedAt: null, createdAt: { $gte: monthStart } }),
    SubscriptionPayment.aggregate([{ $match: { status: 'paid' } }, { $group: {
      _id: null,
      all: { $sum: '$amountPaise' },
      month: { $sum: { $cond: [{ $gte: ['$paidAt', monthStart] }, '$amountPaise', 0] } },
      last: { $sum: { $cond: [{ $and: [{ $gte: ['$paidAt', lastMonthStart] }, { $lt: ['$paidAt', monthStart] }] }, '$amountPaise', 0] } },
      n: { $sum: 1 },
    } }]),
    Shop.aggregate([{ $match: { deletedAt: null, createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, n: { $sum: 1 } } }]),
    SubscriptionPayment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: since6m } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: TZ } }, paise: { $sum: '$amountPaise' }, n: { $sum: 1 } } }]),
    SubscriptionPayment.find({ status: 'paid' }).sort({ paidAt: -1 }).limit(6).select('shopId planCode amountPaise paidAt gateway receiptNumber').lean(),
  ]);

  const [bkMonth, bkPending, onlineShops] = await Promise.all([
    M.Booking.countDocuments({ createdAt: { $gte: monthStart } }),
    M.Booking.countDocuments({ status: 'pending' }),
    Shop.countDocuments({ deletedAt: null, blockedAt: null, 'online.profile.enabled': true }),
  ]);
  const mix = { free: 0, growth: 0, pro: 0 };
  let paidShops = 0;
  let mrrPaise = 0;
  const expiring = [];
  for (const s of shops) {
    const l = liveOf(s, plans);
    mix[l.tier] = (mix[l.tier] || 0) + 1;
    if (l.paid) {
      paidShops++;
      const p = plans.byId.get(s.subscription.planId);
      if (MONTHLY[p.billingPeriod]) mrrPaise += Math.round(p.pricePaise / MONTHLY[p.billingPeriod]);
      if (l.endsAt && new Date(l.endsAt) - now < 7 * DAY) expiring.push({ id: s._id, name: s.name, city: s.city, plan: l.code, endsAt: l.endsAt });
    }
  }
  const sig = new Map(signups.map((r) => [r._id, r.n]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(todayIST(now), -i);
    days.push({ date: d, shops: sig.get(d) || 0 });
  }
  const rev = new Map(revByMonth.map((r) => [r._id, r]));
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const key = shiftMonth(thisMonth, -i);
    months.push({ month: key, paise: (rev.get(key) || {}).paise || 0, count: (rev.get(key) || {}).n || 0 });
  }
  const names = new Map(shops.map((s) => [s._id, s.name]));
  const p = paidRows[0] || { all: 0, month: 0, last: 0, n: 0 };

  ok(res, {
    shops: {
      total: shops.length,
      newThisMonth: shops.filter((s) => new Date(s.createdAt) >= monthStart).length,
      paid: paidShops,
      blocked: shops.filter((s) => s.blockedAt).length,
    },
    users: { total: usersTotal, newThisMonth: usersNew, active7d: usersActive7 },
    orders: { total: ordersTotal, thisMonth: ordersMonth },
    bookings: { thisMonth: bkMonth, pending: bkPending, onlineShops },
    revenue: { thisMonthPaise: p.month, lastMonthPaise: p.last, allTimePaise: p.all, paidCount: p.n, mrrPaise },
    planMix: mix,
    signups30d: days,
    revenue6m: months,
    expiringSoon: expiring.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt)).slice(0, 8),
    recentPayments: recentPays.map((r) => ({ ...r, shopName: names.get(r.shopId) || null })),
    recentShops: shops.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
      .map((s) => ({ id: s._id, name: s.name, city: s.city, createdAt: s.createdAt, plan: liveOf(s, plans).code })),
  });
});

// ---------------------------------------------------------------- shops
// Query: ?q=sharma&tier=pro&status=active|blocked|expired|deleted|verified&city=Ambala&sort=new|old|name
// GET /api/admin/shops
const listShops = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const plans = await loadPlans();
  const status = req.query.status || '';
  const f = { deletedAt: status === 'deleted' ? { $ne: null } : null };
  if (status === 'blocked') f.blockedAt = { $ne: null };
  if (status === 'verified') f.verifiedAt = { $ne: null };
  if (req.query.city) f.city = rx(req.query.city);
  if (req.query.q) {
    const r = rx(req.query.q);
    const owners = await User.find({ $or: [{ name: r }, { email: r }, { phone: r }, { loginPhone: r }] }).select('_id').limit(500).lean();
    f.$or = [{ name: r }, { city: r }, { phone: r }, { whatsappPhone: r }, { _id: String(req.query.q).trim() }, { ownerUserId: { $in: owners.map((u) => u._id) } }];
  }
  const sort = { new: { createdAt: -1 }, old: { createdAt: 1 }, name: { name: 1 } }[req.query.sort] || { createdAt: -1 };
  let all = await Shop.find(f).sort(sort).select('name city phone logoUrl createdAt subscription blockedAt verifiedAt deletedAt ownerUserId members').lean();
  // Plan / expired ka filter "abhi chalu plan" par hota hai (DB mein seedha nahi)
  if (req.query.tier) all = all.filter((s) => liveOf(s, plans).tier === req.query.tier);
  if (status === 'expired') all = all.filter((s) => liveOf(s, plans).expiredPlan);
  if (status === 'active') all = all.filter((s) => !s.blockedAt);
  const page = all.slice(offset, offset + limit);
  const ids = page.map((s) => s._id);
  const [owners, customers, orders] = await Promise.all([
    usersById(page.map((s) => s.ownerUserId)),
    countBy(Customer, 'shopId', ids),
    countBy(Order, 'shopId', ids),
  ]);
  ok(res, {
    items: page.map((s) => ({
      id: s._id, name: s.name, city: s.city || null, phone: s.phone || null, logoUrl: s.logoUrl || null, createdAt: s.createdAt,
      owner: userBrief(owners.get(s.ownerUserId)), plan: liveOf(s, plans),
      members: (s.members || []).filter((m) => m.isActive).length,
      customers: customers.get(s._id) || 0, orders: orders.get(s._id) || 0,
      blockedAt: s.blockedAt || null, verifiedAt: s.verifiedAt || null, deletedAt: s.deletedAt || null,
    })),
    total: all.length, limit, offset,
  });
});

async function loadShop(id) {
  const s = await Shop.findById(String(id)).lean();
  if (!s) throw notFound();
  return s;
}

// GET /api/admin/shops/:id
const getShop = h(async (req, res) => {
  const s = await loadShop(req.params.id);
  const plans = await loadPlans();
  const monthStart = monthStartAt();
  const users = await usersById([s.ownerUserId, ...(s.members || []).map((m) => m.userId)]);
  const [customers, ordersTotal, ordersMonth, staff, collected, pays, recentOrders, logs, byStatus] = await Promise.all([
    Customer.countDocuments({ shopId: s._id, deletedAt: null }),
    Order.countDocuments({ shopId: s._id, deletedAt: null }),
    Order.countDocuments({ shopId: s._id, deletedAt: null, createdAt: { $gte: monthStart } }),
    Staff.countDocuments({ shopId: s._id, deletedAt: null, isActive: true }),
    Payment.aggregate([{ $match: { shopId: s._id, deletedAt: null, direction: 'in' } }, { $group: { _id: null, paise: { $sum: '$amountPaise' } } }]),
    SubscriptionPayment.find({ shopId: s._id }).sort({ createdAt: -1 }).limit(50).select('-raw').lean(),
    Order.find({ shopId: s._id, deletedAt: null }).sort({ createdAt: -1 }).limit(8).select('orderNumber status totalPaise createdAt promisedDeliveryDate').lean(),
    AdminLog.find({ targetId: s._id }).sort({ createdAt: -1 }).limit(20).lean(),
    Order.aggregate([{ $match: { shopId: s._id, deletedAt: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const live = liveOf(s, plans);
  const limits = (plans.byId.get(s.subscription && s.subscription.planId) && live.live ? plans.byId.get(s.subscription.planId) : plans.free || {}).limits || {};
  ok(res, {
    shop: pick(s, ['_id', 'name', 'phone', 'whatsappPhone', 'address', 'city', 'state', 'pincode', 'logoUrl', 'upiId', 'gstin',
      'defaultLanguage', 'createdAt', 'updatedAt', 'blockedAt', 'blockedReason', 'verifiedAt', 'adminNote', 'deletedAt', 'subscription']),
    owner: userBrief(users.get(s.ownerUserId)),
    members: (s.members || []).map((m) => ({ ...userBrief(users.get(m.userId)), userId: m.userId, role: m.role, isActive: m.isActive, since: m.createdAt })),
    plan: live,
    usage: {
      customers: { used: customers, max: limits.maxCustomers ?? null },
      ordersThisMonth: { used: ordersMonth, max: limits.maxOrdersPerMonth ?? null },
      staff: { used: staff, max: limits.maxStaff ?? null },
    },
    stats: { customers, ordersTotal, ordersThisMonth: ordersMonth, staff, collectedPaise: (collected[0] || {}).paise || 0,
      ordersByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.n])) },
    subscriptionPayments: pays,
    recentOrders,
    adminLog: logs,
  });
});

const SHOP_EDIT = ['name', 'phone', 'whatsappPhone', 'address', 'city', 'state', 'pincode', 'adminNote'];

// Body: {"blocked":true,"blockedReason":"fake shop"} | {"verified":true} | {"adminNote":"..."} | {"name":"..."}
// PATCH /api/admin/shops/:id
const updateShop = h(async (req, res) => {
  const b = requireBody(req);
  const s = await loadShop(req.params.id);
  const set = pick(b, SHOP_EDIT);
  const unset = {};
  if (b.blocked !== undefined) {
    if (b.blocked) { set.blockedAt = s.blockedAt || new Date(); set.blockedReason = String(b.blockedReason || '').slice(0, 300); }
    else { set.blockedAt = null; unset.blockedReason = 1; }
  }
  if (b.verified !== undefined) set.verifiedAt = b.verified ? s.verifiedAt || new Date() : null;
  if (!Object.keys(set).length && !Object.keys(unset).length) throw bad('no_fields', ['blocked', 'verified', ...SHOP_EDIT].join(', '));
  if (set.name !== undefined && !String(set.name).trim()) throw bad('no_fields', 'name');
  await Shop.updateOne({ _id: s._id }, { $set: set, ...(Object.keys(unset).length && { $unset: unset }) }, { runValidators: true });
  ok(res, await Shop.findById(s._id).select('-automationRules').lean());
});

// Body: {"days":30} — chalu / expire hua paid plan aage badhao (free mein din)
// POST /api/admin/shops/:id/subscription/extend
const extendSubscription = h(async (req, res) => {
  const days = Number(requireBody(req).days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw bad('days_invalid', '1-3650');
  const s = await loadShop(req.params.id);
  const plans = await loadPlans();
  const sub = s.subscription || {};
  const p = sub.planId && plans.byId.get(sub.planId);
  if (!p || p.pricePaise === 0 || !sub.endsAt) throw bad('extend_needs_plan');
  const base = Math.max(Date.now(), new Date(sub.endsAt).getTime());
  const v = sub.version || 0;
  const r = await Shop.updateOne({ _id: s._id, 'subscription.version': v },
    { $set: { 'subscription.endsAt': new Date(base + days * DAY), 'subscription.status': 'active', 'subscription.version': v + 1 } });
  if (!r.modifiedCount) throw conflict('already_exists', 'subscription changed, try again');
  clearPlanCache();
  ok(res, { subscription: (await Shop.findById(s._id).select('subscription').lean()).subscription, plan: liveOf(await Shop.findById(s._id).lean(), plans) });
});

// Turant Free par (refund / galti). Purani payments wahi rehti hain.
// POST /api/admin/shops/:id/subscription/cancel
const cancelSubscription = h(async (req, res) => {
  const s = await loadShop(req.params.id);
  const free = await Plan.findOne({ code: 'free' }).lean();
  const v = (s.subscription && s.subscription.version) || 0;
  await Shop.updateOne({ _id: s._id }, { $set: { subscription: { planId: free ? free._id : null, planCode: 'free', status: 'active',
    startsAt: new Date(), endsAt: null, lastPaymentId: null, version: v + 1 } } });
  clearPlanCache();
  ok(res, { plan: liveOf(await Shop.findById(s._id).lean(), await loadPlans()) });
});

// Soft delete (app mein dukaan gayab; data rehta hai) / wapas
// POST /api/admin/shops/:id/delete   |   POST /api/admin/shops/:id/restore
const deleteShop = h(async (req, res) => {
  const s = await loadShop(req.params.id);
  await Shop.updateOne({ _id: s._id }, { $set: { deletedAt: s.deletedAt || new Date() } });
  ok(res, { id: s._id, deleted: true });
});
const restoreShop = h(async (req, res) => {
  const s = await loadShop(req.params.id);
  await Shop.updateOne({ _id: s._id }, { $set: { deletedAt: null } });
  ok(res, { id: s._id, deleted: false });
});

// ---------------------------------------------------------------- users
// Query: ?q=&status=active|blocked&type=social|password|phone
// GET /api/admin/users
const listUsers = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = {};
  if (req.query.status === 'blocked') f.isActive = false;
  if (req.query.status === 'active') f.isActive = true;
  if (req.query.type) f.authType = req.query.type;
  if (req.query.q) {
    const r = rx(req.query.q);
    f.$or = [{ name: r }, { email: r }, { phone: r }, { loginPhone: r }, { _id: String(req.query.q).trim() }];
  }
  const [items, total] = await Promise.all([
    User.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('-passwordHash').lean(),
    User.countDocuments(f),
  ]);
  const ids = items.map((u) => u._id);
  const shops = await Shop.find({ deletedAt: null, 'members.userId': { $in: ids } }).select('name members ownerUserId').lean();
  const { adminEmails } = req.app.locals.cfg;
  ok(res, {
    items: items.map((u) => {
      const mine = shops.filter((s) => s.members.some((m) => m.userId === u._id && m.isActive));
      return { ...u, shops: mine.map((s) => ({ id: s._id, name: s.name, role: (s.members.find((m) => m.userId === u._id) || {}).role })),
        isAdmin: !!(u.email && adminEmails.includes(u.email)) };
    }),
    total, limit, offset,
  });
});

// GET /api/admin/users/:id
const getUser = h(async (req, res) => {
  const u = await User.findById(String(req.params.id)).select('-passwordHash').lean();
  if (!u) throw notFound('user_not_found');
  const [shops, sessions] = await Promise.all([
    Shop.find({ 'members.userId': u._id }).select('name city members deletedAt blockedAt').lean(),
    Session.find({ userId: u._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).select('deviceName appVersion lastUsedAt createdAt').lean(),
  ]);
  ok(res, {
    user: u,
    shops: shops.map((s) => ({ id: s._id, name: s.name, city: s.city, deleted: !!s.deletedAt, blocked: !!s.blockedAt,
      role: (s.members.find((m) => m.userId === u._id) || {}).role, active: (s.members.find((m) => m.userId === u._id) || {}).isActive })),
    sessions,
  });
});

function guardSelf(req, userId) {
  if (userId === req.user._id) throw forbidden('admin_self');
}

// Body: {"isActive":false} (block: saare phones se logout) | {"name":"..."}
// PATCH /api/admin/users/:id
const updateUser = h(async (req, res) => {
  const b = requireBody(req);
  const u = await User.findById(String(req.params.id)).lean();
  if (!u) throw notFound('user_not_found');
  const set = pick(b, ['name', 'isActive']);
  if (!Object.keys(set).length) throw bad('no_fields', 'isActive, name');
  if (set.isActive === false) {
    guardSelf(req, u._id);
    const { adminEmails, adminPhones } = req.app.locals.cfg;
    if ((u.email && adminEmails.includes(u.email)) || (u.phone && adminPhones.includes(u.phone))) throw forbidden('admin_env_locked');
  }
  if (set.isActive !== undefined) set.isActive = !!set.isActive;
  await User.updateOne({ _id: u._id }, { $set: set });
  if (set.isActive === false) await Session.updateMany({ userId: u._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  ok(res, await User.findById(u._id).select('-passwordHash').lean());
});

// POST /api/admin/users/:id/logout-all
const logoutUser = h(async (req, res) => {
  const u = await User.findById(String(req.params.id)).select('_id').lean();
  if (!u) throw notFound('user_not_found');
  guardSelf(req, u._id);
  const r = await Session.updateMany({ userId: u._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  ok(res, { sessionsClosed: r.modifiedCount });
});

// ---------------------------------------------------------------- transactions
async function paymentFilter(req) {
  const f = {};
  if (req.query.status) f.status = req.query.status;
  if (req.query.gateway) f.gateway = req.query.gateway;
  if (req.query.plan) f.planCode = new RegExp('^' + escapeRegex(req.query.plan));
  if (req.query.shopId) f.shopId = String(req.query.shopId);
  const from = queryDate(req, 'from');
  const to = queryDate(req, 'to');
  if (from || to) f.createdAt = { ...(from && { $gte: istDateTime(from) }), ...(to && { $lt: istDateTime(addDays(to, 1)) }) };
  if (req.query.q) {
    const r = rx(req.query.q);
    const shops = await Shop.find({ $or: [{ name: r }, { city: r }] }).select('_id').limit(500).lean();
    f.$or = [{ shopId: { $in: shops.map((s) => s._id) } }, { receiptNumber: r }, { gatewayPaymentId: r }, { gatewayOrderId: r }];
  }
  return f;
}

// Query: ?status=paid&gateway=razorpay&plan=pro&from&to&q
// GET /api/admin/subscription-payments
const listPayments = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = await paymentFilter(req);
  const [items, sums, total] = await Promise.all([
    SubscriptionPayment.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('-raw').lean(),
    SubscriptionPayment.aggregate([{ $match: f }, { $group: { _id: '$status', n: { $sum: 1 }, paise: { $sum: '$amountPaise' } } }]),
    SubscriptionPayment.countDocuments(f),
  ]);
  const shops = await Shop.find({ _id: { $in: items.map((p) => p.shopId) } }).select('name city').lean();
  const byId = new Map(shops.map((s) => [s._id, s]));
  const st = Object.fromEntries(sums.map((r) => [r._id, r]));
  const paid = st.paid || { n: 0, paise: 0 };
  ok(res, {
    items: items.map((p) => ({ ...p, shopName: (byId.get(p.shopId) || {}).name || null, city: (byId.get(p.shopId) || {}).city || null })),
    summary: {
      paidCount: paid.n, revenuePaise: paid.paise,
      gstPaise: paid.paise - Math.round(paid.paise / 1.18),
      failedCount: (st.failed || {}).n || 0, refundedCount: (st.refunded || {}).n || 0, refundedPaise: (st.refunded || {}).paise || 0,
    },
    total, limit, offset,
  });
});

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s; // Excel formula injection se bachav
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// GET /api/admin/subscription-payments.csv  (same filters)
const paymentsCsv = h(async (req, res) => {
  const f = await paymentFilter(req);
  const rows = await SubscriptionPayment.find(f).sort({ createdAt: -1 }).limit(20000).select('-raw').lean();
  const shops = await Shop.find({ _id: { $in: [...new Set(rows.map((p) => p.shopId))] } }).select('name city').lean();
  const byId = new Map(shops.map((s) => [s._id, s]));
  const head = ['date', 'receipt', 'shop', 'city', 'plan', 'amount_rupees', 'gst_rupees', 'status', 'gateway', 'method', 'payment_id', 'period_start', 'period_end', 'note'];
  const lines = [head.join(',')];
  for (const p of rows) {
    const s = byId.get(p.shopId) || {};
    const gst = p.amountPaise - Math.round(p.amountPaise / 1.18);
    lines.push([new Date(p.paidAt || p.createdAt).toISOString(), p.receiptNumber, s.name, s.city, p.planCode, (p.amountPaise / 100).toFixed(2),
      (gst / 100).toFixed(2), p.status, p.gateway, p.method, p.gatewayPaymentId, p.periodStart && new Date(p.periodStart).toISOString().slice(0, 10),
      p.periodEnd && new Date(p.periodEnd).toISOString().slice(0, 10), p.note].map(csvCell).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="uliketailor-payments-${todayIST()}.csv"`);
  res.send('﻿' + lines.join('\n'));
});

// Razorpay dashboard se refund karne ke baad yahan record karo (paise yahan se wapas nahi jaate)
// Body: {"note":"refunded on razorpay 12 Nov"}
// POST /api/admin/subscription-payments/:id/mark-refunded
const markRefunded = h(async (req, res) => {
  const p = await SubscriptionPayment.findOneAndUpdate({ _id: String(req.params.id), status: 'paid' },
    { $set: { status: 'refunded', note: String((req.body && req.body.note) || 'refunded').slice(0, 300) } }, { new: true }).select('-raw').lean();
  if (!p) throw bad('payment_not_paid');
  ok(res, p);
});

// ---------------------------------------------------------------- marketplace (commission + growth features)
// GET /api/admin/marketplace-settings
const getMarketplace = h(async (req, res) => ok(res, await marketplace.getConfig()));

// Body: {"commission":{"enabled":true,"stitchingPct":8},"features":{"deals":{"enabled":true,"plans":["growth","pro"]}},"rules":{"maxAdvancePct":25}}
// PUT /api/admin/marketplace-settings
const putMarketplace = h(async (req, res) => {
  const r = await marketplace.updateConfig(requireBody(req), req.admin.email || req.user._id);
  if (r.error) throw bad(r.error, ...(r.arg ? [r.arg] : []));
  ok(res, r.config);
});

// ---------------------------------------------------------------- broadcast
async function broadcastTargets(b) {
  const plans = await loadPlans();
  const f = { deletedAt: null, blockedAt: null };
  if (b.target === 'city') {
    if (!b.city) throw bad('broadcast_target_invalid');
    f.city = new RegExp('^' + escapeRegex(String(b.city).trim()) + '$', 'i');
  } else if (b.target === 'shops') {
    if (!Array.isArray(b.shopIds) || !b.shopIds.length) throw bad('broadcast_target_invalid');
    f._id = { $in: b.shopIds.map(String) };
  } else if (b.target !== 'all' && b.target !== 'tier') throw bad('broadcast_target_invalid');
  let shops = await Shop.find(f).select('subscription').lean();
  if (b.target === 'tier') {
    if (!marketplace.TIERS.includes(b.tier)) throw bad('broadcast_target_invalid');
    shops = shops.filter((s) => liveOf(s, plans).tier === b.tier);
  }
  return shops.map((s) => s._id);
}

// Body: {"title":"New feature!","body":"...","target":"all|tier|city|shops","tier":"free","city":"Ambala","shopIds":[],"dryRun":true}
// Har dukaan ko in-app notification + phone par push (Firebase set ho to)
// POST /api/admin/broadcast
const broadcast = h(async (req, res) => {
  const b = requireBody(req);
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) throw bad('broadcast_title_required');
  const ids = await broadcastTargets(b);
  if (b.dryRun) return ok(res, { shopCount: ids.length, dryRun: true });
  if (!ids.length) throw bad('broadcast_no_shops');
  const body = String(b.body || '').slice(0, 500);
  const row = await Broadcast.create({ title, body, target: b.target, tier: b.tier, city: b.city, shopIds: b.target === 'shops' ? ids : [],
    shopCount: ids.length, sentBy: req.admin.email || req.user._id });
  // create() har document par save hook chalata hai -> push
  for (let i = 0; i < ids.length; i += 200) {
    await Notification.create(ids.slice(i, i + 200).map((shopId) => ({ shopId, type: 'admin_broadcast', title, body, data: { broadcastId: row._id } })));
  }
  created(res, row);
});

// GET /api/admin/broadcasts
const listBroadcasts = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const [items, total] = await Promise.all([Broadcast.find().sort({ createdAt: -1 }).skip(offset).limit(limit).lean(), Broadcast.countDocuments()]);
  ok(res, { items, total, limit, offset });
});

// ---------------------------------------------------------------- festivals (poore India ke)
// GET /api/admin/festivals
const listFestivals = h(async (req, res) => {
  ok(res, await Festival.find({ shopId: null, deletedAt: null }).sort({ date: 1 }).lean());
});

// DELETE /api/admin/festivals/:id
const deleteFestival = h(async (req, res) => {
  const r = await Festival.updateOne({ _id: String(req.params.id), shopId: null, deletedAt: null }, { $set: { deletedAt: new Date() } });
  if (!r.matchedCount) throw notFound('festival_not_found');
  ok(res, { id: req.params.id, deleted: true });
});

// ---------------------------------------------------------------- admins
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/admin/admins
const listAdmins = h(async (req, res) => {
  const { adminEmails, adminPhones } = req.app.locals.cfg;
  const db = await AdminUser.find().sort({ createdAt: 1 }).lean();
  ok(res, [
    ...adminEmails.map((email) => ({ email, role: 'owner', source: 'env', isActive: true })),
    ...adminPhones.map((phone) => ({ phone, role: 'owner', source: 'env', isActive: true })),
    ...db.map((a) => ({ ...a, source: 'panel' })),
  ]);
});

// Body: {"email":"helper@gmail.com","name":"Ravi","role":"support"}  — wo isi email se Google login karega
// POST /api/admin/admins
const addAdmin = h(async (req, res) => {
  const b = requireBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) throw bad('email_invalid');
  if (req.app.locals.cfg.adminEmails.includes(email)) throw conflict('admin_exists');
  const role = ADMIN_ROLES.includes(b.role) ? b.role : 'support';
  try {
    created(res, await AdminUser.create({ email, name: b.name ? String(b.name).slice(0, 80) : undefined, role, addedBy: req.admin.email || req.user._id }));
  } catch (e) {
    if (e && e.code === 11000) throw conflict('admin_exists');
    throw e;
  }
});

// Body: {"role":"owner"} | {"isActive":false}
// PATCH /api/admin/admins/:id
const updateAdmin = h(async (req, res) => {
  const a = await AdminUser.findById(String(req.params.id)).lean();
  if (!a) throw notFound();
  if (a.email === req.admin.email) throw forbidden('admin_self');
  const set = pick(requireBody(req), ['role', 'isActive', 'name']);
  if (set.role !== undefined && !ADMIN_ROLES.includes(set.role)) throw bad('invalid_value', 'role');
  if (!Object.keys(set).length) throw bad('no_fields', 'role, isActive, name');
  ok(res, await AdminUser.findByIdAndUpdate(a._id, { $set: set }, { new: true }).lean());
});

// DELETE /api/admin/admins/:id
const removeAdmin = h(async (req, res) => {
  const a = await AdminUser.findById(String(req.params.id)).lean();
  if (!a) throw notFound();
  if (a.email === req.admin.email) throw forbidden('admin_self');
  await AdminUser.deleteOne({ _id: a._id });
  ok(res, { id: a._id, deleted: true });
});

// ---------------------------------------------------------------- audit log
// Query: ?q=shops&targetId=
// GET /api/admin/audit-log
const auditLog = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = {};
  if (req.query.targetId) f.targetId = String(req.query.targetId);
  if (req.query.q) { const r = rx(req.query.q); f.$or = [{ action: r }, { email: r }, { path: r }]; }
  const [items, total] = await Promise.all([AdminLog.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(), AdminLog.countDocuments(f)]);
  ok(res, { items, total, limit, offset });
});

// Har badlav (GET ke alawa) jo safal raha, AdminLog mein. Password / token kabhi save nahi.
const SECRET_RX = /pass|token|secret|otp|key/i;
function redact(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 3) return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = SECRET_RX.test(k) ? '***' : redact(val, depth + 1);
  return out;
}
const ID_RX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function audit(req, res, next) {
  if (req.method === 'GET' || (req.body && req.body.dryRun)) return next(); // dry run = sirf ginti
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const path = req.baseUrl + req.path;
    const action = req.method + ' ' + path.replace(/^\/api\/admin/, '').replace(new RegExp(ID_RX.source, 'gi'), ':id');
    AdminLog.create({ userId: req.user && req.user._id, email: req.admin && (req.admin.email || req.admin.phone), action, path,
      targetId: (ID_RX.exec(path) || [])[0] || (req.params && req.params.id) || null, body: redact(req.body || {}), ip: req.ip })
      .catch((e) => console.error(JSON.stringify({ level: 'ERROR', msg: 'admin log', err: e.message })));
  });
  next();
}

module.exports = {
  me, dashboard,
  listShops, getShop, updateShop, extendSubscription, cancelSubscription, deleteShop, restoreShop,
  listUsers, getUser, updateUser, logoutUser,
  listPayments, paymentsCsv, markRefunded,
  getMarketplace, putMarketplace,
  broadcast, listBroadcasts,
  listFestivals, deleteFestival,
  listAdmins, addAdmin, updateAdmin, removeAdmin,
  auditLog, audit,
};
