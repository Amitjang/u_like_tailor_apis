// ======================= OFFLINE SYNC =======================
// PULL: app bolta hai "mere paas sinceSeq tak ka data hai", server usse naye saare
//       badlaav bhejta hai (deleted bhi, deletedAt ke saath). nextSeq save karo;
//       hasMore=true ho to dobara pull karo.
// PUSH: offline mein bane/badle documents bhejo. ID app khud banata hai (UUID).
//       Last-write-wins: server ka document naya ho to "rejected" (reasonCode: sync_server_newer)
//       — tab app pull karke server wala le.
// Embedded data saath aata hai: customer ke saath parivar (members), order ke saath kapde (items).
// ============================================================

const i18n = require('../utils/i18n');
const M = require('../models');
const { h, ok, bad, requireBody, toApiError, clean } = require('../utils/http.helpers');
const { randomToken } = require('../utils/auth');
const { refreshOrder, refreshFabricStock } = require('../utils/orders');
const { normalizePhone } = require('../utils/phone');

const own = (shopId) => ({ shopId });
const ownOrSystem = (shopId) => ({ shopId: { $in: [shopId, null] } });

// [naam, Model, filter]
const PULL = [
  ['shops', M.Shop, (s) => ({ _id: s })],
  ['garmentTypes', M.GarmentType, ownOrSystem],
  ['festivals', M.Festival, ownOrSystem],
  ['messageTemplates', M.MessageTemplate, ownOrSystem],
  ['customers', M.Customer, own],
  ['measurements', M.Measurement, own],
  ['orders', M.Order, own],
  ['payments', M.Payment, own],
  ['expenses', M.Expense, own],
  ['staff', M.Staff, own],
  ['pieceRates', M.PieceRate, own],
  ['workAssignments', M.WorkAssignment, own],
  ['staffAdvances', M.StaffAdvance, own],
  ['staffPayouts', M.StaffPayout, own],
  ['attendance', M.Attendance, own],
  ['fabrics', M.Fabric, own],
  ['fabricTransactions', M.FabricTransaction, own],
  ['designs', M.Design, own],
  ['media', M.Media, own],
];

// Body: {"sinceSeq":0,"deviceId":"abc","limit":500}
// POST /api/sync/pull
const pull = h(async (req, res) => {
  const b = req.body || {};
  const since = Number(b.sinceSeq) || 0;
  const lim = Math.min(Math.max(parseInt(b.limit, 10) || 500, 1), 2000);
  const changes = {};
  let maxSeq = since;
  let truncatedAt = null;
  for (const [name, Model, filter] of PULL) {
    const docs = await Model.find({ ...filter(req.shopId), syncSeq: { $gt: since } }).sort({ syncSeq: 1 }).limit(lim).lean();
    if (!docs.length) continue;
    changes[name] = docs;
    const top = docs[docs.length - 1].syncSeq;
    maxSeq = Math.max(maxSeq, top);
    if (docs.length === lim) truncatedAt = truncatedAt === null ? top : Math.min(truncatedAt, top);
  }
  // Koi collection limit tak bhara tha to usi ke last seq se aage (kuch documents dobara aa sakte hain — koi baat nahi)
  const hasMore = truncatedAt !== null;
  const nextSeq = hasMore ? truncatedAt : maxSeq;
  if (b.deviceId) {
    await M.SyncDevice.updateOne({ shopId: req.shopId, deviceId: String(b.deviceId) },
      { $set: { userId: req.user._id, lastPulledSeq: nextSeq, lastSeenAt: new Date() } }, { upsert: true });
  }
  ok(res, { changes, nextSeq, hasMore, serverTime: new Date() });
});

// ---------- PUSH ----------
const CUSTOMER = ['name', 'phone', 'whatsappPhone', 'altPhone', 'address', 'area', 'photoUrl', 'tags', 'notes', 'whatsappOptIn',
  'source', 'referredByCustomerId', 'preferredLanguage', 'members', 'deletedAt'];
const PUSH = {
  customers: { Model: M.Customer, fields: CUSTOMER, refs: { referredByCustomerId: M.Customer } },
  measurements: { Model: M.Measurement, refs: { customerId: M.Customer },
    fields: ['customerId', 'memberId', 'garmentTypeId', 'values', 'unit', 'fitPreference', 'notes', 'inputMethod', 'voiceTranscript', 'version', 'isCurrent', 'takenAt', 'deletedAt'] },
  orders: { Model: M.Order, refs: { customerId: M.Customer, parentOrderId: M.Order },
    fields: ['customerId', 'orderType', 'parentOrderId', 'status', 'isUrgent', 'orderDate', 'trialDate', 'promisedDeliveryDate', 'deliveredAt',
      'festivalId', 'discountPaise', 'taxPaise', 'notes', 'cancelledReason', 'items', 'deletedAt'] },
  payments: { Model: M.Payment, refs: { customerId: M.Customer, orderId: M.Order },
    fields: ['customerId', 'orderId', 'amountPaise', 'direction', 'purpose', 'mode', 'referenceNo', 'receivedAt', 'note', 'deletedAt'] },
  expenses: { Model: M.Expense, fields: ['category', 'amountPaise', 'spentOn', 'mode', 'note', 'deletedAt'] },
  workAssignments: { Model: M.WorkAssignment, refs: { orderId: M.Order, staffId: M.Staff },
    fields: ['orderId', 'itemId', 'staffId', 'task', 'quantity', 'ratePaise', 'status', 'assignedAt', 'dueDate', 'completedAt', 'deletedAt'] },
  attendance: { Model: M.Attendance, refs: { staffId: M.Staff }, fields: ['staffId', 'date', 'status', 'note', 'deletedAt'] },
  fabricTransactions: { Model: M.FabricTransaction, refs: { fabricId: M.Fabric, orderId: M.Order },
    fields: ['fabricId', 'txnType', 'quantity', 'orderId', 'itemId', 'unitCostPaise', 'note', 'deletedAt'] },
  media: { Model: M.Media, fields: ['entityType', 'entityId', 'kind', 'url', 'thumbnailUrl', 'mimeType', 'sizeBytes', 'caption', 'deletedAt'] },
};
// Pehle customer, phir order...
const ORDER = ['customers', 'measurements', 'orders', 'payments', 'expenses', 'workAssignments', 'attendance', 'fabricTransactions', 'media'];

class Reject extends Error {
  constructor(code, arg) { super(code); this.code = code; this.arg = arg; }
}

// Offline order ke kapdon mein naam, QR wagairah server bharta hai
async function prepareOrderItems(shopId, data) {
  if (data.items === undefined && data.customerId === undefined) return;
  const customer = await M.Customer.findOne({ _id: data.customerId, shopId }).lean();
  if (!customer) throw new Reject('sync_foreign_reference', 'customerId');
  data.customerName = customer.name;
  data.customerPhone = customer.phone;
  if (!Array.isArray(data.items)) return;
  for (const it of data.items) {
    const member = (customer.members || []).find((m) => m._id === it.memberId);
    if (!member) throw new Reject('sync_foreign_reference', 'memberId');
    const g = await M.GarmentType.findOne({ _id: it.garmentTypeId, shopId: { $in: [shopId, null] } }).lean();
    if (!g) throw new Reject('sync_foreign_reference', 'garmentTypeId');
    Object.assign(it, { memberName: member.name, memberRelation: member.relation, garmentCode: g.code, garmentName: g.name, garmentNameHi: g.nameHi });
    if (!it.qrCode) it.qrCode = randomToken(8);
  }
}

async function pushOne(shopId, userId, name, raw, touched) {
  const spec = PUSH[name];
  const id = raw && raw.id;
  if (!id || typeof id !== 'string') throw new Reject('sync_id_required');
  const clientUpdated = new Date(raw.updatedAt);
  if (Number.isNaN(clientUpdated.getTime())) throw new Reject('sync_updated_at_required');
  const data = {};
  for (const f of spec.fields) if (raw[f] !== undefined) data[f] = raw[f];
  if (data.deletedAt) data.deletedAt = new Date(data.deletedAt);
  for (const [f, Ref] of Object.entries(spec.refs || {})) {
    if (data[f] && !(await Ref.exists({ _id: data[f], shopId }))) throw new Reject('sync_foreign_reference', f);
  }
  if (name === 'customers') for (const k of ['phone', 'whatsappPhone', 'altPhone']) if (data[k]) data[k] = normalizePhone(data[k]) || data[k];
  if (name === 'orders') await prepareOrderItems(shopId, data);

  const existing = await spec.Model.findById(id).select('shopId updatedAt').lean();
  if (existing && existing.shopId !== shopId) throw new Reject('sync_foreign_reference', 'id');
  if (existing && existing.updatedAt > clientUpdated) throw new Reject('sync_server_newer');
  try {
    if (existing) {
      const doc = await spec.Model.findOne({ _id: id, shopId });
      doc.set(data);
      await doc.save(); // validators + embedded hooks chalte hain
    } else {
      const extra = {};
      if (name === 'orders') Object.assign(extra, { trackingToken: randomToken(9), createdByUserId: userId, orderNumber: null, history: [] });
      await spec.Model.create({ ...data, ...extra, _id: id, shopId });
    }
  } catch (e) {
    if (e instanceof Reject) throw e;
    const ae = toApiError(e);
    throw new Reject('sync_invalid', ae ? (ae.args && ae.args[0]) || ae.key : 'invalid');
  }
  if (name === 'orders') touched.orders.add(id);
  if (name === 'payments' && data.orderId) touched.orders.add(data.orderId);
  if (name === 'fabricTransactions') touched.fabrics.add(data.fabricId || (await M.FabricTransaction.findById(id).lean()).fabricId);
}

// Body: {"deviceId":"abc","changes":{"customers":[{"id","name","phone","members":[...],"updatedAt"}],"orders":[...]}}
// POST /api/sync/push
const push = h(async (req, res) => {
  const changes = requireBody(req).changes || {};
  for (const name of Object.keys(changes)) if (!PUSH[name]) throw bad('sync_table_not_allowed', name);
  const accepted = [];
  const rejected = [];
  const assignedOrderNumbers = {};
  const touched = { orders: new Set(), fabrics: new Set() };

  for (const name of ORDER) {
    for (const raw of changes[name] || []) {
      try {
        await pushOne(req.shopId, req.user._id, name, raw, touched);
        accepted.push(raw.id);
      } catch (e) {
        if (!(e instanceof Reject)) throw e;
        const reason = e.arg !== undefined ? i18n.t(req.lang, e.code, e.arg) : i18n.t(req.lang, e.code);
        rejected.push({ collection: name, id: raw && raw.id, reasonCode: e.code, reason });
      }
    }
  }
  // Offline orders ko number do, totals dobara jodo
  for (const id of touched.orders) {
    const o = await M.Order.findOne({ _id: id, shopId: req.shopId });
    if (!o) continue;
    if (o.orderNumber === null || o.orderNumber === undefined) {
      const shop = await M.Shop.findByIdAndUpdate(req.shopId, { $inc: { orderCounter: 1 } }, { new: true }).lean();
      o.orderNumber = shop.orderCounter;
      o.history.push({ toStatus: o.status, changedByUserId: req.user._id, via: 'app', note: 'offline sync' });
      await o.save();
      assignedOrderNumbers[id] = o.orderNumber;
    }
    try {
      await refreshOrder(id);
    } catch { // galat discount: total 0 se kam nahi hone dete
      await M.Order.updateOne({ _id: id }, { $set: { discountPaise: o.subtotalPaise + o.taxPaise } });
      await refreshOrder(id).catch(() => {});
    }
  }
  for (const f of touched.fabrics) if (f) await refreshFabricStock(f);
  ok(res, clean({ accepted, rejected, assignedOrderNumbers }));
});

module.exports = {
  pull,
  push,
};
