// Karigar: piece rate, kaam dena, advance, hisaab (payout), attendance, roz ki capacity.

const i18n = require('../utils/i18n');
const { Staff, PieceRate, WorkAssignment, StaffAdvance, StaffPayout, Attendance, Order, GarmentType } = require('../models');
const { h, ok, created, bad, notFound, conflict, forbidden, pick, paging, queryDate, bodyDate, requireBody } = require('../utils/http.helpers');
const { requireRole, checkLimit } = require('../middleware');
const { todayIST, istDateOf, addDays } = require('../utils/dates');
const { normalizePhones } = require('./shop.controller');
const { crud } = require('../utils/route.helpers');
const { garmentName } = require('../utils/orders');

const STAFF_FIELDS = ['userId', 'name', 'phone', 'role', 'payType', 'monthlySalaryPaise', 'dailyWagePaise', 'skills', 'joinedOn', 'leftOn', 'isActive', 'photoUrl', 'notes'];
const staffCrud = crud(Staff, STAFF_FIELDS, 'staff_not_found');

async function mustStaff(shopId, id) {
  const s = await Staff.findOne({ _id: id, shopId, deletedAt: null }).lean();
  if (!s) throw notFound('staff_not_found');
  return s;
}

// Karigar-wise baaki kamaai: done (unpaid) kaam - advance
async function earnings(shopId, staffIds) {
  const match = { shopId, deletedAt: null, payoutId: null };
  if (staffIds) match.staffId = { $in: staffIds };
  const [work, adv] = await Promise.all([
    WorkAssignment.aggregate([{ $match: { ...match, status: 'done' } }, { $group: { _id: '$staffId', pieces: { $sum: '$quantity' }, earned: { $sum: '$amountPaise' } } }]),
    StaffAdvance.aggregate([{ $match: match }, { $group: { _id: '$staffId', advance: { $sum: '$amountPaise' } } }]),
  ]);
  const out = new Map();
  for (const w of work) out.set(w._id, { unpaidPieces: w.pieces, unpaidEarningsPaise: w.earned, pendingAdvancePaise: 0 });
  for (const a of adv) out.set(a._id, { unpaidPieces: 0, unpaidEarningsPaise: 0, ...(out.get(a._id) || {}), pendingAdvancePaise: a.advance });
  for (const v of out.values()) v.payablePaise = v.unpaidEarningsPaise - v.pendingAdvancePaise;
  return out;
}
const EMPTY = { unpaidPieces: 0, unpaidEarningsPaise: 0, pendingAdvancePaise: 0, payablePaise: 0 };

// Query: ?active=true
// GET /api/workers
const getWorkers = h(async (req, res) => {
  const f = { shopId: req.shopId, deletedAt: null };
  if (req.query.active === 'true') f.isActive = true;
  const list = await Staff.find(f).sort({ isActive: -1, name: 1 }).lean();
  const [earn, pending] = await Promise.all([
    earnings(req.shopId),
    WorkAssignment.aggregate([{ $match: { shopId: req.shopId, deletedAt: null, status: { $in: ['assigned', 'in_progress', 'rework'] } } }, { $group: { _id: '$staffId', n: { $sum: 1 } } }]),
  ]);
  const pend = new Map(pending.map((p) => [p._id, p.n]));
  ok(res, list.map((s) => ({ ...s, pendingWork: pend.get(s._id) || 0, payablePaise: (earn.get(s._id) || EMPTY).payablePaise })));
});

// Body: {"name":"Salim","phone":"98..","role":"karigar","payType":"piece_rate"}
// POST /api/workers
const createWorker = h(async (req, res) => {
  normalizePhones(requireBody(req), ['phone']);
  await checkLimit(req.shop, 'maxStaff');
  await staffCrud.create(req, res);
});
// PATCH /api/workers/:id
const updateWorker = h(async (req, res) => {
  normalizePhones(requireBody(req), ['phone']);
  await staffCrud.update(req, res);
});
// DELETE /api/workers/:id
const deleteWorker = h(staffCrud.remove);

// sab karigaron ka baaki hisaab
// GET /api/workers/earnings
const getEarnings = h(async (req, res) => {
  const list = await Staff.find({ shopId: req.shopId, deletedAt: null, isActive: true }).select('name').lean();
  const earn = await earnings(req.shopId);
  ok(res, list.map((s) => ({ staffId: s._id, name: s.name, ...(earn.get(s._id) || EMPTY) })).sort((a, b) => b.payablePaise - a.payablePaise));
});

// Body: {"items":[{"garmentTypeId","piecesPerDay":3}]} (0 = hatao)
// PUT /api/workers/:id/capacity
const setCapacity = h(async (req, res) => {
  const s = await mustStaff(req.shopId, req.params.id);
  const cap = new Map((s.capacity || []).map((c) => [c.garmentTypeId, c.piecesPerDay]));
  for (const it of requireBody(req).items || []) {
    if (Number(it.piecesPerDay) > 0) cap.set(it.garmentTypeId, Number(it.piecesPerDay)); else cap.delete(it.garmentTypeId);
  }
  const capacity = [...cap].map(([garmentTypeId, piecesPerDay]) => ({ garmentTypeId, piecesPerDay }));
  await Staff.updateOne({ _id: s._id }, { $set: { capacity } });
  const gs = await GarmentType.find({ _id: { $in: capacity.map((c) => c.garmentTypeId) } }).lean();
  const byId = new Map(gs.map((g) => [g._id, g]));
  ok(res, capacity.map((c) => ({ ...c, garment: i18n.pick(req.lang, (byId.get(c.garmentTypeId) || {}).name, (byId.get(c.garmentTypeId) || {}).nameHi) })));
});

// Kaam ki list ko order/kapde/customer ke naam ke saath
async function viewAssignments(list, lang) {
  const orders = await Order.find({ _id: { $in: [...new Set(list.map((w) => w.orderId))] } }).select('orderNumber customerName items').lean();
  const staff = await Staff.find({ _id: { $in: [...new Set(list.map((w) => w.staffId))] } }).select('name').lean();
  const oById = new Map(orders.map((o) => [o._id, o]));
  const sById = new Map(staff.map((s) => [s._id, s.name]));
  return list.map((w) => {
    const o = oById.get(w.orderId) || { items: [] };
    const it = o.items.find((i) => i._id === w.itemId) || {};
    return { ...w, staffName: sById.get(w.staffId), garment: garmentName(lang, it), orderNumber: o.orderNumber, customerName: o.customerName, deliveryDate: it.deliveryDate };
  });
}

// Body: {"staffId","task":"stitching","quantity":1,"dueDate":"2026-10-08"}
// ratePaise na do to piece-rate table se apne aap
// POST /api/orders/items/:itemId/assign
const assignWork = h(async (req, res) => {
  const b = requireBody(req);
  const o = await Order.findOne({ shopId: req.shopId, deletedAt: null, 'items._id': req.params.itemId }).select('items').lean();
  const item = o && o.items.find((i) => i._id === req.params.itemId);
  if (!item || item.deletedAt || ['delivered', 'cancelled'].includes(item.status)) throw notFound('item_not_assignable');
  await mustStaff(req.shopId, b.staffId);
  let rate = b.ratePaise;
  if (rate === undefined || rate === null) {
    const rates = await PieceRate.find({ shopId: req.shopId, garmentTypeId: item.garmentTypeId, task: b.task, deletedAt: null,
      staffId: { $in: [b.staffId, null] }, effectiveFrom: { $lte: todayIST() } }).lean();
    rates.sort((a, c) => ((c.staffId ? 1 : 0) - (a.staffId ? 1 : 0)) || c.effectiveFrom.localeCompare(a.effectiveFrom));
    rate = rates[0] ? rates[0].ratePaise : 0;
  }
  const w = await WorkAssignment.create({ shopId: req.shopId, orderId: o._id, itemId: item._id, staffId: b.staffId, task: b.task,
    quantity: b.quantity || item.quantity, ratePaise: rate, dueDate: bodyDate(b.dueDate, 'dueDate') });
  created(res, (await viewAssignments([w.toObject()], req.lang))[0]);
});

// Body: {"status":"done"} — payment ho chuka kaam badla nahi ja sakta
// PATCH /api/workers/assignments/:id
const updateAssignment = h(async (req, res) => {
  const b = requireBody(req);
  const f = { _id: req.params.id, shopId: req.shopId, deletedAt: null, payoutId: null };
  if (req.role === 'staff') { // staff sirf apna kaam badle
    f.staffId = { $in: (await Staff.find({ shopId: req.shopId, userId: req.user._id }).select('_id').lean()).map((s) => s._id) };
  }
  const w = await WorkAssignment.findOne(f);
  if (!w) throw conflict('work_locked');
  if (b.quantity !== undefined) w.quantity = b.quantity;
  if (b.dueDate !== undefined) w.dueDate = bodyDate(b.dueDate, 'dueDate');
  if (b.status !== undefined) {
    w.status = b.status;
    w.completedAt = b.status === 'done' ? w.completedAt || new Date() : null;
  }
  await w.save();
  ok(res, (await viewAssignments([w.toObject()], req.lang))[0]);
});

// Query: ?status=assigned,in_progress&unpaid=true — Body: (staff sirf apna)
// GET /api/workers/:id/work
const getWork = h(async (req, res) => {
  const s = await mustStaff(req.shopId, req.params.id);
  if (req.role === 'staff' && s.userId !== req.user._id) throw forbidden('own_work_only');
  const { limit, offset } = paging(req);
  const f = { shopId: req.shopId, staffId: s._id, deletedAt: null };
  if (req.query.status) f.status = { $in: String(req.query.status).split(',') };
  if (req.query.unpaid === 'true') { f.status = 'done'; f.payoutId = null; }
  const list = await WorkAssignment.find(f).sort({ dueDate: 1, assignedAt: 1 }).skip(offset).limit(limit).lean();
  ok(res, { items: await viewAssignments(list, req.lang), limit, offset });
});

// Body: {"amountPaise":200000,"mode":"cash"}
// POST /api/workers/:id/advances
const giveAdvance = h(async (req, res) => {
  await mustStaff(req.shopId, req.params.id);
  const b = requireBody(req);
  created(res, await StaffAdvance.create({ shopId: req.shopId, staffId: req.params.id, amountPaise: b.amountPaise,
    givenOn: bodyDate(b.givenOn, 'givenOn') || todayIST(), mode: b.mode || null, note: b.note }));
});

// GET /api/workers/:id/payouts
const getPayouts = h(async (req, res) => {
  ok(res, await StaffPayout.find({ shopId: req.shopId, staffId: req.params.id, deletedAt: null }).sort({ periodEnd: -1 }).lean());
});

// Body: {"periodEnd":"2026-10-05","fixedEarningsPaise":0,"bonusPaise":0,"mode":"cash","dryRun":true}
// periodEnd tak ke saare "done" kaam aur advance jod-ghata kar hisaab.
// POST /api/workers/:id/payouts
const createPayout = h(async (req, res) => {
  const b = req.body || {};
  const s = await mustStaff(req.shopId, req.params.id);
  const end = bodyDate(b.periodEnd, 'periodEnd') || todayIST();
  const endAt = new Date(new Date(end + 'T00:00:00+05:30').getTime() + 86400000); // end ka din poora
  const workF = { shopId: req.shopId, staffId: s._id, status: 'done', payoutId: null, deletedAt: null, completedAt: { $lt: endAt } };
  const advF = { shopId: req.shopId, staffId: s._id, payoutId: null, deletedAt: null, givenOn: { $lte: end } };
  const [work, advs, last] = await Promise.all([
    WorkAssignment.find(workF).lean(), StaffAdvance.find(advF).lean(),
    StaffPayout.findOne({ staffId: s._id, deletedAt: null }).sort({ periodEnd: -1 }).lean(),
  ]);
  const pieces = work.reduce((x, w) => x + w.amountPaise, 0);
  const advance = advs.reduce((x, a) => x + a.amountPaise, 0);
  let start = bodyDate(b.periodStart, 'periodStart')
    || (last ? addDays(last.periodEnd, 1) : null)
    || (work.length ? work.map((w) => istDateOf(new Date(w.completedAt))).sort()[0] : end);
  if (start > end) start = end;
  const fixed = Number(b.fixedEarningsPaise || 0);
  const bonus = Number(b.bonusPaise || 0);
  const gross = pieces + fixed + bonus;
  const net = gross - advance;
  const summary = { periodStart: start, periodEnd: end, pieceEarningsPaise: pieces, workItems: work.length, fixedEarningsPaise: fixed,
    bonusPaise: bonus, advanceDeductedPaise: advance, advances: advs.length, netPaidPaise: net };
  if (b.dryRun) return created(res, { dryRun: true, payout: summary });
  if (net < 0) throw bad('advance_exceeds_earnings');
  if (gross === 0 && advance === 0) throw bad('payout_nothing');
  const p = await StaffPayout.create({ shopId: req.shopId, staffId: s._id, ...summary, mode: b.mode || 'cash', paidAt: new Date(), note: b.note });
  // Sirf wahi kaam/advance jo hisaab mein gine gaye (beech mein naye aaye to agli baar)
  await WorkAssignment.updateMany({ _id: { $in: work.map((w) => w._id) }, payoutId: null }, { $set: { payoutId: p._id } });
  await StaffAdvance.updateMany({ _id: { $in: advs.map((a) => a._id) }, payoutId: null }, { $set: { payoutId: p._id } });
  created(res, p);
});

// ---------- Piece rate ----------
// GET /api/workers/piece-rates
const getPieceRates = h(async (req, res) => {
  const list = await PieceRate.find({ shopId: req.shopId, deletedAt: null }).sort({ task: 1, effectiveFrom: -1 }).lean();
  const [gs, ss] = await Promise.all([
    GarmentType.find({ _id: { $in: list.map((p) => p.garmentTypeId) } }).lean(),
    Staff.find({ _id: { $in: list.map((p) => p.staffId).filter(Boolean) } }).select('name').lean(),
  ]);
  const g = new Map(gs.map((x) => [x._id, x]));
  const st = new Map(ss.map((x) => [x._id, x.name]));
  ok(res, list.map((p) => ({ ...p, garment: i18n.pick(req.lang, (g.get(p.garmentTypeId) || {}).name, (g.get(p.garmentTypeId) || {}).nameHi), staffName: st.get(p.staffId) || null })));
});

// Body: {"garmentTypeId","task":"stitching","ratePaise":15000,"staffId":null,"effectiveFrom":"2026-10-01"}
// PUT /api/workers/piece-rates
const setPieceRate = h(async (req, res) => {
  const b = requireBody(req);
  if (b.staffId) await mustStaff(req.shopId, b.staffId);
  const key = { shopId: req.shopId, garmentTypeId: b.garmentTypeId, task: b.task, staffId: b.staffId || null,
    effectiveFrom: bodyDate(b.effectiveFrom, 'effectiveFrom') || todayIST(), deletedAt: null };
  const p = await PieceRate.findOneAndUpdate(key, { $set: { ratePaise: b.ratePaise } }, { upsert: true, new: true, runValidators: true }).lean();
  ok(res, p);
});

// ---------- Attendance ----------
async function attendanceView(req, date) {
  const d = date || todayIST();
  const [staff, att] = await Promise.all([
    Staff.find({ shopId: req.shopId, deletedAt: null, isActive: true }).sort({ name: 1 }).select('name role').lean(),
    Attendance.find({ shopId: req.shopId, date: d, deletedAt: null }).lean(),
  ]);
  const byStaff = new Map(att.map((a) => [a.staffId, a]));
  return staff.map((s) => ({ staffId: s._id, name: s.name, role: s.role, date: d, status: (byStaff.get(s._id) || {}).status || null, note: (byStaff.get(s._id) || {}).note || null }));
}

// GET /api/workers/attendance
const getAttendance = h(async (req, res) => ok(res, await attendanceView(req, queryDate(req, 'date'))));

// Body: {"date":"2026-10-03","entries":[{"staffId","status":"present"}]}
// PUT /api/workers/attendance
const saveAttendance = h(async (req, res) => {
  const b = requireBody(req);
  const date = bodyDate(b.date, 'date') || todayIST();
  for (const e of b.entries || []) {
    await mustStaff(req.shopId, e.staffId);
    await Attendance.findOneAndUpdate({ staffId: e.staffId, date },
      { $set: { status: e.status, note: e.note, deletedAt: null }, $setOnInsert: { shopId: req.shopId, staffId: e.staffId, date } },
      { upsert: true, runValidators: true });
  }
  ok(res, await attendanceView(req, date));
});

module.exports = {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  getEarnings,
  setCapacity,
  assignWork,
  updateAssignment,
  getWork,
  giveAdvance,
  getPayouts,
  createPayout,
  getPieceRates,
  setPieceRate,
  getAttendance,
  saveAttendance,
  earnings,
};
