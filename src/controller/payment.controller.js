// Payments, udhaar, kharcha.

const { Payment, Order, Customer, Expense } = require('../models');
const { h, ok, created, bad, notFound, conflict, paging, queryDate, requireBody } = require('../utils/http.helpers');
const { requireRole } = require('../middleware');
const { rupees } = require('../utils/money');
const { enqueue } = require('../utils/notify');
const { refreshOrder } = require('../utils/orders');
const { istDateTime, addDays, todayIST } = require('../utils/dates');
const { localize, crud } = require('../utils/route.helpers');
const { duesByCustomer } = require('./customer.controller');

async function customerDue(shopId, customerId) {
  const d = (await duesByCustomer(shopId, [customerId])).get(customerId);
  return d ? d.totalDuePaise : 0;
}

//  Order par:        {"customerId","orderId","amountPaise":50000,"mode":"upi"}
//  Udhaar jama:      {"customerId","amountPaise":100000,"mode":"cash"}  -> purane orders pehle (FIFO)
// POST /api/payments
const receivePayment = h(async (req, res) => {
  const b = requireBody(req);
  const amount = Number(b.amountPaise);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw bad('amount_positive');
  const mode = b.mode || 'cash';
  const customer = await Customer.findOne({ _id: b.customerId, shopId: req.shopId, deletedAt: null }).lean();
  if (!customer) throw notFound('customer_not_found');
  const base = { shopId: req.shopId, customerId: customer._id, mode, referenceNo: b.referenceNo, note: b.note, receivedByUserId: req.user._id };
  const saved = [];

  if (b.orderId) {
    const o = await Order.findOne({ _id: b.orderId, shopId: req.shopId, customerId: customer._id, deletedAt: null }).lean();
    if (!o) throw notFound('order_not_for_customer');
    if (o.status === 'cancelled') throw conflict('payment_on_cancelled');
    if (amount > o.balancePaise) throw bad('amount_exceeds_balance', rupees(o.balancePaise));
    saved.push(await Payment.create({ ...base, orderId: o._id, amountPaise: amount, purpose: b.purpose || 'balance' }));
    await refreshOrder(o._id);
  } else {
    const dues = await Order.find({ shopId: req.shopId, customerId: customer._id, deletedAt: null, status: { $ne: 'cancelled' }, balancePaise: { $gt: 0 } })
      .sort({ promisedDeliveryDate: 1, createdAt: 1 }).select('balancePaise').lean();
    if (!dues.length) throw bad('no_dues');
    const total = dues.reduce((s, d) => s + d.balancePaise, 0);
    if (amount > total) throw bad('amount_exceeds_dues', rupees(total));
    let left = amount;
    for (const d of dues) {
      if (!left) break;
      const pay = Math.min(left, d.balancePaise);
      saved.push(await Payment.create({ ...base, orderId: d._id, amountPaise: pay, purpose: 'udhaar' }));
      await refreshOrder(d._id);
      left -= pay;
    }
  }

  const due = await customerDue(req.shopId, customer._id);
  let message = null;
  if (b.sendWhatsApp !== false) {
    message = localize(req, await enqueue({
      shopId: req.shopId, customerId: customer._id, orderId: b.orderId || null, event: 'payment_received',
      vars: { customer_name: customer.name, shop_name: req.shop.name, amount: rupees(amount), balance: rupees(due) },
    }));
  }
  created(res, { payments: saved, customerDuePaise: due, message });
});

// Tareekh filter (IST) -> receivedAt range
function receivedRange(req) {
  const from = queryDate(req, 'from');
  const to = queryDate(req, 'to');
  if (!from && !to) return null;
  return { ...(from && { $gte: istDateTime(from) }), ...(to && { $lt: istDateTime(addDays(to, 1)) }) };
}

// Query: ?from=2026-10-01&to=2026-10-31&mode=upi&customerId=
// GET /api/payments
const getPayments = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = { shopId: req.shopId, deletedAt: null };
  const range = receivedRange(req);
  if (range) f.receivedAt = range;
  if (req.query.mode) f.mode = req.query.mode;
  if (req.query.customerId) f.customerId = req.query.customerId;
  const [list, summary] = await Promise.all([
    Payment.find(f).sort({ receivedAt: -1 }).skip(offset).limit(limit).lean(),
    Payment.aggregate([{ $match: f }, { $group: {
      _id: '$mode', s: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$amountPaise', { $multiply: ['$amountPaise', -1] }] } },
    } }]),
  ]);
  const [customers, orders] = await Promise.all([
    Customer.find({ _id: { $in: list.map((p) => p.customerId) } }).select('name').lean(),
    Order.find({ _id: { $in: list.map((p) => p.orderId).filter(Boolean) } }).select('orderNumber').lean(),
  ]);
  const cn = new Map(customers.map((c) => [c._id, c.name]));
  const on = new Map(orders.map((o) => [o._id, o.orderNumber]));
  ok(res, {
    items: list.map((p) => ({ ...p, customerName: cn.get(p.customerId), orderNumber: on.get(p.orderId) || null })),
    summary: { totalPaise: summary.reduce((s, x) => s + x.s, 0), byMode: Object.fromEntries(summary.map((x) => [x._id, x.s])) },
    limit, offset,
  });
});

// Body: (galat entry; order ka baaki apne aap theek)
// DELETE /api/payments/:id
const deletePayment = h(async (req, res) => {
  const p = await Payment.findOneAndUpdate({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: { deletedAt: new Date() } }).lean();
  if (!p) throw notFound();
  if (p.orderId) await refreshOrder(p.orderId);
  ok(res, { deleted: true });
});

// udhaar wale customers, sabse zyada pehle
// GET /api/payments/dues
const getDues = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const all = [...(await duesByCustomer(req.shopId)).values()].sort((a, b) => b.totalDuePaise - a.totalDuePaise);
  const page = all.slice(offset, offset + limit);
  const customers = await Customer.find({ _id: { $in: page.map((d) => d._id) } }).select('name phone').lean();
  const byId = new Map(customers.map((c) => [c._id, c]));
  const today = todayIST();
  const daysOld = (d) => Math.round((new Date(today) - new Date(d)) / 86400000);
  ok(res, {
    items: page.map((d) => ({ customerId: d._id, name: (byId.get(d._id) || {}).name, phone: (byId.get(d._id) || {}).phone,
      totalDuePaise: d.totalDuePaise, ordersWithDue: d.ordersWithDue, oldestOrderDate: d.oldestOrderDate, daysOld: daysOld(d.oldestOrderDate) })),
    totalDuePaise: all.reduce((s, d) => s + d.totalDuePaise, 0),
    customersCount: all.length, limit, offset,
  });
});

// ---------- Kharcha ----------
const expenses = crud(Expense, ['category', 'amountPaise', 'spentOn', 'mode', 'note']);

// Query: ?from=&to=&category=
// GET /api/expenses
const getExpenses = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = { shopId: req.shopId, deletedAt: null };
  const from = queryDate(req, 'from');
  const to = queryDate(req, 'to');
  if (from || to) f.spentOn = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (req.query.category) f.category = req.query.category;
  ok(res, { items: await Expense.find(f).sort({ spentOn: -1, createdAt: -1 }).skip(offset).limit(limit).lean(), limit, offset });
});

// Body: {"category":"rent","amountPaise":500000,"spentOn":"2026-10-01"}
// POST /api/expenses
const createExpense = h(async (req, res) => {
  if (!req.body.spentOn) req.body.spentOn = todayIST();
  await expenses.create(req, res, { createdBy: req.user._id });
});
// DELETE /api/expenses/:id
const deleteExpense = h(expenses.remove);

module.exports = {
  receivePayment,
  getPayments,
  deletePayment,
  getDues,
  getExpenses,
  createExpense,
  deleteExpense,
  receivedRange,
};
