// Tyohar + capacity planner, dashboard ("aaj ka kaam"), monthly report.

const i18n = require('../utils/i18n');
const { Festival, Order, Staff, GarmentType, Payment, Expense, StaffPayout, Customer, WorkAssignment, Fabric } = require('../models');
const { h, ok, created, bad, notFound, requireBody, bodyDate } = require('../utils/http.helpers');
const { requireRole } = require('../middleware');
const { todayIST, addDays, daysBetween, weekday, istDateTime, istDateOf } = require('../utils/dates');
const { duesByCustomer } = require('./customer.controller');
const { garmentName } = require('../utils/orders');

const OPEN = { $nin: ['delivered', 'cancelled'] };
const sumIn = (list) => list.reduce((s, p) => s + (p.direction === 'in' ? p.amountPaise : -p.amountPaise), 0);

// Pending kaam ke kapde (ready/delivered/cancelled nahi) jinki delivery `till` tak hai
async function pendingPieces(shopId, till) {
  const orders = await Order.find({ shopId, deletedAt: null, status: OPEN }).select('items promisedDeliveryDate').lean();
  const out = new Map();
  for (const o of orders) {
    for (const it of o.items) {
      if (it.deletedAt || ['ready', 'delivered', 'cancelled'].includes(it.status)) continue;
      if ((it.deliveryDate || o.promisedDeliveryDate) > till) continue;
      out.set(it.garmentTypeId, (out.get(it.garmentTypeId) || 0) + it.quantity);
    }
  }
  return out;
}

// Query: ?days=90 — aane wale tyohar (displayName bhasha mein) + orders
// GET /api/festivals
const getFestivals = h(async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 90, 400);
  const today = todayIST();
  const list = await Festival.find({ shopId: { $in: [req.shopId, null] }, deletedAt: null, date: { $gte: today, $lte: addDays(today, days) } }).sort({ date: 1 }).lean();
  const counts = await Order.aggregate([{ $match: { shopId: req.shopId, deletedAt: null, status: { $ne: 'cancelled' }, festivalId: { $in: list.map((f) => f._id) } } }, { $group: { _id: '$festivalId', n: { $sum: 1 } } }]);
  const byF = new Map(counts.map((c) => [c._id, c.n]));
  const out = [];
  for (const f of list) {
    const pending = await pendingPieces(req.shopId, f.date);
    out.push({ ...f, displayName: i18n.pick(req.lang, f.name, f.nameHi), isCustom: f.shopId !== null, daysLeft: daysBetween(today, f.date),
      isRushTime: today >= addDays(f.date, -f.rushStartsDaysBefore), ordersCount: byF.get(f._id) || 0,
      pendingPiecesBefore: [...pending.values()].reduce((s, n) => s + n, 0) });
  }
  ok(res, out);
});

// Body: {"name":"Wedding season","nameHi":"शादी का सीज़न","date":"2026-11-25","rushStartsDaysBefore":30}
// POST /api/festivals
const createFestival = h(async (req, res) => {
  const b = requireBody(req);
  created(res, await Festival.create({ shopId: req.shopId, name: b.name, nameHi: b.nameHi, date: bodyDate(b.date, 'date'),
    region: b.region, rushStartsDaysBefore: b.rushStartsDaysBefore, notes: b.notes }));
});

// Tyohar tak (kaam ke din × karigaron ki roz ki capacity) − pending kaam = aur kitne le sakte ho
// GET /api/festivals/:id/capacity
const getFestivalCapacity = h(async (req, res) => {
  const f = await Festival.findOne({ _id: req.params.id, shopId: { $in: [req.shopId, null] }, deletedAt: null }).lean();
  if (!f) throw notFound();
  const today = todayIST();
  let workingDays = 0;
  for (let d = today; d < f.date; d = addDays(d, 1)) if ((req.shop.workingDays || []).includes(weekday(d))) workingDays++;
  const [staff, garments, pending] = await Promise.all([
    Staff.find({ shopId: req.shopId, deletedAt: null, isActive: true }).select('capacity').lean(),
    GarmentType.find({ shopId: { $in: [req.shopId, null] }, deletedAt: null, isActive: true }).sort({ sortOrder: 1 }).lean(),
    pendingPieces(req.shopId, f.date),
  ]);
  const perDay = new Map();
  for (const s of staff) for (const c of s.capacity || []) perDay.set(c.garmentTypeId, (perDay.get(c.garmentTypeId) || 0) + c.piecesPerDay);
  const rows = garments.map((g) => {
    const pd = perDay.get(g._id) || 0;
    const total = Math.floor(pd * workingDays);
    const p = pending.get(g._id) || 0;
    return { garmentTypeId: g._id, garment: i18n.pick(req.lang, g.name, g.nameHi), capacityPerDay: pd, totalCapacity: total,
      pendingPieces: p, canAcceptMore: Math.max(total - p, 0), overloaded: p > total };
  }).filter((x) => x.capacityPerDay > 0 || x.pendingPieces > 0).sort((a, b) => b.pendingPieces - a.pendingPieces);
  ok(res, {
    festival: { id: f._id, name: i18n.pick(req.lang, f.name, f.nameHi), date: f.date, daysLeft: daysBetween(today, f.date) },
    workingDays, garments: rows, capacityMissing: perDay.size === 0,
  });
});

// "Aaj ka kaam" ek call mein (staff ko paisa nahi dikhta)
// GET /api/dashboard
const getDashboard = h(async (req, res) => {
  const shopId = req.shopId;
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const open = await Order.find({ shopId, deletedAt: null, status: OPEN })
    .select('orderNumber customerName customerPhone status balancePaise isUrgent promisedDeliveryDate trialDate').lean();
  const brief = (o) => ({ id: o._id, orderNumber: o.orderNumber, customerName: o.customerName, customerPhone: o.customerPhone, status: o.status });
  const late = open.filter((o) => o.promisedDeliveryDate < today && o.status !== 'ready').sort((a, b) => a.promisedDeliveryDate.localeCompare(b.promisedDeliveryDate));
  const statusCounts = {};
  for (const o of open) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  const [pendingWork, lowStock, nextFestival] = await Promise.all([
    WorkAssignment.countDocuments({ shopId, deletedAt: null, status: { $in: ['assigned', 'in_progress', 'rework'] } }),
    Fabric.countDocuments({ shopId, deletedAt: null, $expr: { $lte: ['$stockQty', '$lowStockThreshold'] } }),
    Festival.findOne({ shopId: { $in: [shopId, null] }, deletedAt: null, date: { $gte: today } }).sort({ date: 1 }).lean(),
  ]);
  const out = {
    date: today,
    todayDeliveries: open.filter((o) => o.promisedDeliveryDate === today)
      .sort((a, b) => (b.isUrgent - a.isUrgent) || (a.orderNumber - b.orderNumber))
      .map((o) => ({ ...brief(o), balancePaise: o.balancePaise, isUrgent: o.isUrgent })),
    todayTrials: open.filter((o) => o.trialDate === today).map(brief),
    tomorrow: { deliveries: open.filter((o) => o.promisedDeliveryDate === tomorrow).length, trials: open.filter((o) => o.trialDate === tomorrow).length },
    late: { count: late.length, top: late.slice(0, 5).map((o) => ({ ...brief(o), promisedDeliveryDate: o.promisedDeliveryDate, daysLate: daysBetween(o.promisedDeliveryDate, today) })) },
    readyNotCollected: statusCounts.ready || 0,
    statusCounts,
    pendingWork,
    lowStockFabrics: lowStock,
    nextFestival: nextFestival ? { id: nextFestival._id, name: i18n.pick(req.lang, nextFestival.name, nextFestival.nameHi), date: nextFestival.date, daysLeft: daysBetween(today, nextFestival.date) } : null,
    money: null,
  };
  if (req.role !== 'staff') {
    const dayStart = istDateTime(today);
    const monthStart = istDateTime(today.slice(0, 8) + '01');
    const [todayPay, monthPay, todayExp, dues] = await Promise.all([
      Payment.find({ shopId, deletedAt: null, receivedAt: { $gte: dayStart } }).select('amountPaise direction').lean(),
      Payment.find({ shopId, deletedAt: null, receivedAt: { $gte: monthStart } }).select('amountPaise direction').lean(),
      Expense.find({ shopId, deletedAt: null, spentOn: today }).select('amountPaise').lean(),
      duesByCustomer(shopId),
    ]);
    out.money = {
      todayCollectionPaise: sumIn(todayPay), todayExpensePaise: todayExp.reduce((s, e) => s + e.amountPaise, 0),
      monthCollectionPaise: sumIn(monthPay), totalDuePaise: [...dues.values()].reduce((s, d) => s + d.totalDuePaise, 0),
    };
  }
  ok(res, out);
});

// Query: ?month=2026-10
// GET /api/dashboard/reports/monthly
const getMonthlyReport = h(async (req, res) => {
  const month = req.query.month || todayIST().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('month_format');
  const first = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const s = istDateTime(first);
  const e = istDateTime(nextFirst);
  const shopId = req.shopId;
  const [payments, expenses, payouts, orders, delivered, newCustomers] = await Promise.all([
    Payment.find({ shopId, deletedAt: null, receivedAt: { $gte: s, $lt: e } }).lean(),
    Expense.find({ shopId, deletedAt: null, spentOn: { $gte: first, $lt: nextFirst } }).lean(),
    StaffPayout.find({ shopId, deletedAt: null, paidAt: { $gte: s, $lt: e } }).lean(),
    Order.find({ shopId, deletedAt: null, status: { $ne: 'cancelled' }, orderDate: { $gte: first, $lt: nextFirst } }).lean(),
    Order.find({ shopId, deletedAt: null, deliveredAt: { $gte: s, $lt: e } }).select('deliveredAt promisedDeliveryDate').lean(),
    Customer.countDocuments({ shopId, deletedAt: null, createdAt: { $gte: s, $lt: e } }),
  ]);
  const income = sumIn(payments);
  const expense = expenses.reduce((x, ex) => x + ex.amountPaise, 0);
  const staffPaid = payouts.reduce((x, p) => x + p.netPaidPaise, 0);
  const group = (list, key, val) => list.reduce((acc, x) => { const k = key(x); acc[k] = (acc[k] || 0) + val(x); return acc; }, {});
  const byGarment = {};
  for (const o of orders) {
    for (const it of o.items) {
      if (it.deletedAt || it.status === 'cancelled') continue;
      const k = garmentName(req.lang, it);
      byGarment[k] = byGarment[k] || { garment: k, pieces: 0, valuePaise: 0 };
      byGarment[k].pieces += it.quantity;
      byGarment[k].valuePaise += it.amountPaise;
    }
  }
  const topCustomers = Object.values(orders.reduce((acc, o) => {
    acc[o.customerId] = acc[o.customerId] || { id: o.customerId, name: o.customerName, spentPaise: 0, orders: 0 };
    acc[o.customerId].spentPaise += o.totalPaise;
    acc[o.customerId].orders += 1;
    return acc;
  }, {})).sort((a, b) => b.spentPaise - a.spentPaise).slice(0, 5);
  const daily = group(payments, (p) => istDateOf(new Date(p.receivedAt)), (p) => (p.direction === 'in' ? p.amountPaise : -p.amountPaise));
  ok(res, {
    month, incomePaise: income, expensePaise: expense, staffPaidPaise: staffPaid, profitPaise: income - expense - staffPaid,
    orders: { count: orders.length, valuePaise: orders.reduce((x, o) => x + o.totalPaise, 0), delivered: delivered.length,
      deliveredLate: delivered.filter((o) => istDateOf(new Date(o.deliveredAt)) > o.promisedDeliveryDate).length },
    newCustomers,
    byGarment: Object.values(byGarment).sort((a, b) => b.pieces - a.pieces),
    byPaymentMode: group(payments, (p) => p.mode, (p) => (p.direction === 'in' ? p.amountPaise : -p.amountPaise)),
    expenseByCategory: group(expenses, (x) => x.category, (x) => x.amountPaise),
    topCustomers,
    dailyCollection: Object.entries(daily).sort().map(([day, paise]) => ({ day, paise })),
  });
});

module.exports = {
  getFestivals,
  createFestival,
  getFestivalCapacity,
  getDashboard,
  getMonthlyReport,
};
