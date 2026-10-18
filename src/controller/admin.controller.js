// ======================= APP ADMIN (aap khud) =======================
// ADMIN_PHONES wale numbers hi chala sakte hain:
// plans ki keemat/limits, naya plan, kisi dukaan ko haath se plan dena (cash / free),
// saari dukaanon ki kamaai, aur poore India ke tyohar.

const { Plan, Shop, SubscriptionPayment, Festival } = require('../models');
const { h, ok, created, bad, notFound, pick, paging, queryDate, requireBody, bodyDate } = require('../utils/http.helpers');
const billing = require('../utils/billing');
const { clearPlanCache } = require('../utils/plans');
const { gstSplit } = require('../utils/money');
const { istDateTime, addDays } = require('../utils/dates');

const PLAN_FIELDS = ['tier', 'name', 'nameHi', 'description', 'descriptionHi', 'pricePaise', 'billingPeriod', 'limits', 'isActive', 'sortOrder'];

// saare plans (band bhi) + kitni dukaanein us par hain
// GET /api/admin/plans
const getAllPlans = h(async (req, res) => {
  const plans = await Plan.find().sort({ sortOrder: 1, code: 1 }).lean();
  const counts = await Shop.aggregate([
    { $match: { deletedAt: null, 'subscription.status': 'active' } },
    { $group: { _id: '$subscription.planId', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [c._id, c.n]));
  ok(res, plans.map((p) => ({ ...p, activeShops: byId.get(p._id) || 0 })));
});

// Body: {"code":"pro_quarterly","tier":"pro","name":"Pro (3 months)","nameHi":"प्रो (3 महीने)","pricePaise":79900,"billingPeriod":"quarterly","limits":{...}}
// POST /api/admin/plans
const createPlan = h(async (req, res) => {
  const b = requireBody(req);
  if (!b.code) throw bad('no_fields', 'code');
  const p = await Plan.create({ code: b.code, ...pick(b, PLAN_FIELDS), tier: b.tier || b.code });
  clearPlanCache();
  created(res, p);
});

// Body: {"pricePaise":15900} — nayi keemat sirf aage ki kharid par
// PATCH /api/admin/plans/:id
const updatePlan = h(async (req, res) => {
  const set = pick(requireBody(req), PLAN_FIELDS);
  if (!Object.keys(set).length) throw bad('no_fields', PLAN_FIELDS.join(', '));
  const p = await Plan.findByIdAndUpdate(req.params.id, { $set: set }, { new: true, runValidators: true }).lean();
  if (!p) throw notFound('plan_not_found');
  clearPlanCache();
  ok(res, p);
});

// Body: {"planCode":"growth","amountPaise":0,"method":"cash","note":"launch offer"}
// amountPaise 0 = free (trial / promotion). Renew/upgrade ka niyam wahi jo online kharid ka.
// POST /api/admin/shops/:shopId/subscription/grant
const grantSubscription = h(async (req, res) => {
  const b = requireBody(req);
  const amount = Number(b.amountPaise || 0);
  if (!Number.isSafeInteger(amount) || amount < 0) throw bad('amount_positive');
  const plan = await billing.planByCode(b.planCode);
  const shop = await Shop.findOne({ _id: req.params.shopId, deletedAt: null }).lean();
  if (!shop) throw notFound();
  const row = await SubscriptionPayment.create({ shopId: shop._id, planId: plan._id, planCode: plan.code, amountPaise: amount,
    gateway: 'manual', status: 'created', method: b.method || 'cash', note: b.note, createdBy: req.user._id });
  created(res, await billing.activate(row._id));
});

// Query: ?status=paid&from=2026-10-01&to=2026-10-31
// GET /api/admin/subscription-payments
const getAllSubscriptionPayments = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = {};
  if (req.query.status) f.status = req.query.status;
  const from = queryDate(req, 'from');
  const to = queryDate(req, 'to');
  if (from || to) f.createdAt = { ...(from && { $gte: istDateTime(from) }), ...(to && { $lt: istDateTime(addDays(to, 1)) }) };
  const [items, all] = await Promise.all([
    SubscriptionPayment.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('-raw').lean(),
    SubscriptionPayment.find(f).select('status amountPaise').lean(),
  ]);
  const shops = await Shop.find({ _id: { $in: items.map((p) => p.shopId) } }).select('name city').lean();
  const byId = new Map(shops.map((s) => [s._id, s]));
  const paid = all.filter((p) => p.status === 'paid');
  ok(res, {
    items: items.map((p) => ({ ...p, shopName: (byId.get(p.shopId) || {}).name, city: (byId.get(p.shopId) || {}).city })),
    summary: {
      paidCount: paid.length,
      revenuePaise: paid.reduce((s, p) => s + p.amountPaise, 0),
      gstPaise: paid.reduce((s, p) => s + gstSplit(p.amountPaise).gstPaise, 0),
      failedCount: all.filter((p) => p.status === 'failed').length,
    },
    limit, offset,
  });
});

// Body: {"name":"Diwali","nameHi":"दिवाली","date":"2026-11-08","rushStartsDaysBefore":30}
// Sab dukaanon ko dikhte hain (har saal sahi tareekh ke saath bharein)
// POST /api/admin/festivals
const createSystemFestival = h(async (req, res) => {
  const b = requireBody(req);
  created(res, await Festival.create({ shopId: null, name: b.name, nameHi: b.nameHi, date: bodyDate(b.date, 'date'),
    region: b.region, rushStartsDaysBefore: b.rushStartsDaysBefore, notes: b.notes }));
});

module.exports = {
  getAllPlans,
  createPlan,
  updatePlan,
  grantSubscription,
  getAllSubscriptionPayments,
  createSystemFestival,
};
