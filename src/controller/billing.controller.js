// ======================= SUBSCRIPTION KHARIDNA =======================
// App mein flow (shop owner):
//   1. GET  /api/public/plans                           -> pricing screen
//   2. GET  /api/billing/preview?plan=pro               -> "आपका प्लान 08 नवंबर 2026 तक चलेगा" (optional)
//   3. POST /api/billing/checkout {"planCode":"pro"}    -> Razorpay order (key, orderId, amount)
//   4. App mein razorpay_flutter checkout (UPI / card / netbanking)
//   5. Success par: POST /api/billing/verify {razorpayOrderId, razorpayPaymentId, razorpaySignature}
//   6. Backup: Razorpay webhook (/api/webhooks/razorpay) — app band ho jaaye tab bhi plan chalu
// ======================================================================

const i18n = require('../utils/i18n');
const { SubscriptionPayment, Shop, User, Plan } = require('../models');
const { h, ok, created, bad, notFound, paging, requireBody, ApiError } = require('../utils/http.helpers');
const { requireRole } = require('../middleware');
const billing = require('../utils/billing');
const { gstSplit } = require('../utils/money');
const { subscriptionView } = require('./shop.controller');

async function preview(req, code) {
  const plan = await billing.planByCode(code);
  const cur = await billing.currentOf(req.shop);
  const pv = billing.compute(new Date(), cur, plan);
  return { plan, pv: { ...pv, message: billing.previewMessage(req.lang, pv) } };
}

const notConfigured = () => new ApiError(503, 'payments_not_configured', 'payments_not_configured');

// Query: ?plan=pro_yearly
// GET /api/billing/preview
const previewPlan = h(async (req, res) => ok(res, (await preview(req, req.query.plan)).pv));

// Body: {"planCode":"growth"}  (sirf owner)
// POST /api/billing/checkout
const checkout = h(async (req, res) => {
  const pay = req.app.locals.pay;
  if (!pay) throw notConfigured();
  const { plan, pv } = await preview(req, requireBody(req).planCode);
  const row = await SubscriptionPayment.create({ shopId: req.shopId, planId: plan._id, planCode: plan.code, amountPaise: plan.pricePaise,
    gateway: 'razorpay', status: 'created', createdBy: req.user._id });
  let orderId;
  try {
    orderId = await pay.createOrder(plan.pricePaise, row._id.slice(0, 40), { shopId: req.shopId, planCode: plan.code, paymentId: row._id });
  } catch (e) {
    console.error(JSON.stringify({ level: 'ERROR', msg: 'razorpay create order', err: e.message }));
    await billing.markFailed(row._id, 'order_create_failed');
    throw new ApiError(502, 'payment_gateway_error', 'payment_gateway_error');
  }
  await SubscriptionPayment.updateOne({ _id: row._id }, { $set: { gatewayOrderId: orderId } });
  const name = req.user.name || req.shop.name;
  const planName = i18n.pick(req.lang, plan.name, plan.nameHi);
  created(res, {
    paymentId: row._id,
    gateway: 'razorpay',
    // razorpay_flutter ke options mein seedha yahi bhejein
    razorpay: {
      key: pay.keyId, order_id: orderId, amount: plan.pricePaise, currency: 'INR', name: 'U Like Tailor',
      description: i18n.t(req.lang, 'plan_description', planName),
      prefill: { contact: req.user.phone, name }, notes: { shopId: req.shopId, planCode: plan.code },
    },
    plan,
    preview: pv,
  });
});

// Body: {"razorpayOrderId","razorpayPaymentId","razorpaySignature"}
// POST /api/billing/verify
const verifyPayment = h(async (req, res) => {
  const pay = req.app.locals.pay;
  if (!pay) throw notConfigured();
  const b = requireBody(req);
  if (!b.razorpayOrderId || !b.razorpayPaymentId || !b.razorpaySignature) throw bad('payment_fields_required');
  const row = await SubscriptionPayment.findOne({ gateway: 'razorpay', gatewayOrderId: b.razorpayOrderId, shopId: req.shopId }).lean();
  if (!row) throw notFound('payment_not_found');
  if (!pay.verifyPayment(b.razorpayOrderId, b.razorpayPaymentId, b.razorpaySignature)) {
    console.warn(JSON.stringify({ level: 'WARN', msg: 'razorpay signature mismatch', order: b.razorpayOrderId, shop: req.shopId }));
    throw bad('payment_signature_invalid');
  }
  const result = await billing.activate(row._id, { gatewayPaymentId: b.razorpayPaymentId });
  const shop = await Shop.findById(req.shopId).lean();
  ok(res, { result, subscription: await subscriptionView(shop, req.lang) });
});

// Query: ?status=paid — kharid history + receipt (GST alag)
// GET /api/billing/payments
const getSubscriptionPayments = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = { shopId: req.shopId };
  if (req.query.status) f.status = req.query.status;
  const list = await SubscriptionPayment.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('-raw').lean();
  const plans = await Plan.find({ _id: { $in: list.map((p) => p.planId) } }).lean();
  const byId = new Map(plans.map((p) => [p._id, p]));
  ok(res, {
    items: list.map((p) => ({ ...p, ...gstSplit(p.amountPaise), planName: i18n.pick(req.lang, (byId.get(p.planId) || {}).name, (byId.get(p.planId) || {}).nameHi) })),
    limit, offset,
  });
});

module.exports = {
  previewPlan,
  checkout,
  verifyPayment,
  getSubscriptionPayments,
};
