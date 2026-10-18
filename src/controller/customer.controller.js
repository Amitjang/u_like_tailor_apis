// Customers + parivar (ek number par poora ghar) + naap (history ke saath).

const i18n = require('../utils/i18n');
const { Customer, Measurement, Order, GarmentType } = require('../models');
const { h, ok, created, bad, notFound, conflict, pick, paging, requireBody, escapeRegex } = require('../utils/http.helpers');
const { requireRole, checkLimit } = require('../middleware');
const { normalizePhone } = require('../utils/phone');
const { normalizePhones } = require('./shop.controller');
const { findGarment, checkValues } = require('./service.controller');

// preferredLanguage: "hi" / "en" / null (null = dukaan ki bhasha). WhatsApp isi bhasha mein.
const CUSTOMER_FIELDS = ['name', 'phone', 'whatsappPhone', 'altPhone', 'address', 'area', 'photoUrl', 'tags', 'notes',
  'whatsappOptIn', 'source', 'referredByCustomerId', 'preferredLanguage'];
const MEMBER_FIELDS = ['name', 'relation', 'gender', 'dateOfBirth', 'anniversaryDate', 'notes'];
const PHONES = ['phone', 'whatsappPhone', 'altPhone'];

// Customer-wise udhaar (orders ka baaki jod)
async function duesByCustomer(shopId, customerIds) {
  const match = { shopId, deletedAt: null, status: { $ne: 'cancelled' }, balancePaise: { $gt: 0 } };
  if (customerIds) match.customerId = { $in: customerIds };
  const rows = await Order.aggregate([
    { $match: match },
    { $group: { _id: '$customerId', totalDuePaise: { $sum: '$balancePaise' }, ordersWithDue: { $sum: 1 }, oldestOrderDate: { $min: '$promisedDeliveryDate' } } },
  ]);
  return new Map(rows.map((x) => [x._id, x]));
}

// Detail: customer + parivar (har member ke current naap) + udhaar + haal ke orders
async function customerDetail(shopId, id, lang) {
  const c = await Customer.findOne({ _id: id, shopId, deletedAt: null }).lean();
  if (!c) throw notFound('customer_not_found');
  c.members = (c.members || []).filter((m) => !m.deletedAt);
  const [measurements, dues, spent, recent, shop] = await Promise.all([
    Measurement.find({ shopId, customerId: id, isCurrent: true, deletedAt: null }).lean(),
    duesByCustomer(shopId, [id]),
    Order.aggregate([{ $match: { shopId, customerId: id, deletedAt: null, status: { $ne: 'cancelled' } } }, { $group: { _id: null, s: { $sum: '$totalPaise' } } }]),
    Order.find({ shopId, customerId: id, deletedAt: null }).sort({ createdAt: -1 }).limit(10)
      .select('orderNumber status orderDate promisedDeliveryDate totalPaise balancePaise').lean(),
    require('../models').Shop.findById(shopId).select('defaultLanguage').lean(),
  ]);
  const garments = await GarmentType.find({ _id: { $in: [...new Set(measurements.map((m) => m.garmentTypeId))] } }).lean();
  const gById = new Map(garments.map((g) => [g._id, g]));
  for (const m of c.members) {
    m.measurements = measurements.filter((x) => x.memberId === m._id).map((x) => {
      const g = gById.get(x.garmentTypeId) || {};
      return { id: x._id, garmentTypeId: x.garmentTypeId, garment: i18n.pick(lang, g.name, g.nameHi), values: x.values,
        unit: x.unit, fitPreference: x.fitPreference, notes: x.notes, version: x.version, takenAt: x.takenAt, sortOrder: g.sortOrder || 0 };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const due = dues.get(id);
  return {
    ...c,
    effectiveLanguage: c.preferredLanguage || (shop && shop.defaultLanguage) || i18n.DEFAULT,
    duePaise: due ? due.totalDuePaise : 0,
    totalSpentPaise: spent[0] ? spent[0].s : 0,
    recentOrders: recent,
  };
}

// Query: ?q=ram&tag=VIP&hasDue=true&sort=recent&limit=50&offset=0
// GET /api/customers
const getCustomers = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const filter = { shopId: req.shopId, deletedAt: null };
  const q = String(req.query.q || '').trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }];
    if (digits) filter.$or.push({ phone: new RegExp(escapeRegex(digits)) });
  }
  if (req.query.tag) filter.tags = req.query.tag;
  if (req.query.hasDue === 'true') filter._id = { $in: [...(await duesByCustomer(req.shopId)).keys()] };
  const sort = req.query.sort === 'recent' ? { updatedAt: -1 } : { name: 1 };
  const list = await Customer.find(filter).collation({ locale: 'en', strength: 2 }).sort(sort).skip(offset).limit(limit)
    .select('name phone area tags photoUrl preferredLanguage updatedAt members').lean();
  const dues = await duesByCustomer(req.shopId, list.map((c) => c._id));
  const items = list.map(({ members, ...c }) => ({
    ...c, duePaise: dues.has(c._id) ? dues.get(c._id).totalDuePaise : 0,
    membersCount: (members || []).filter((m) => !m.deletedAt).length,
  }));
  ok(res, { items, limit, offset });
});

// {"name":"Ramesh","phone":"98...","preferredLanguage":"hi","members":[{"name":"Ramesh","relation":"self"},{"name":"Aarav","relation":"son"}]}
// members na diye to ek "self" member apne aap.
// POST /api/customers
const createCustomer = h(async (req, res) => {
  const body = requireBody(req);
  const data = normalizePhones(pick(body, CUSTOMER_FIELDS), PHONES);
  let members = body.members;
  if (members !== undefined && !Array.isArray(members)) throw bad('members_invalid');
  if (!members || !members.length) members = [{ name: data.name, relation: 'self' }];
  await checkLimit(req.shop, 'maxCustomers');
  const c = await Customer.create({ ...data, shopId: req.shopId, members: members.map((m) => pick(m, [...MEMBER_FIELDS, '_id'])) });
  created(res, await customerDetail(req.shopId, c._id, req.lang));
});

// Query: ?phone=98... — Body: (order lete waqt number daalte hi customer)
// GET /api/customers/lookup
const lookupCustomer = h(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) throw bad('phone_invalid');
  const list = await Customer.find({ shopId: req.shopId, deletedAt: null, $or: [{ phone }, { whatsappPhone: phone }, { altPhone: phone }] }).lean();
  if (!list.length) throw notFound('customer_phone_not_found');
  const c = list.find((x) => x.phone === phone) || list[0];
  ok(res, await customerDetail(req.shopId, c._id, req.lang));
});

// GET /api/customers/:id
const getCustomerById = h(async (req, res) => ok(res, await customerDetail(req.shopId, req.params.id, req.lang)));

// PATCH /api/customers/:id
const updateCustomer = h(async (req, res) => {
  const set = normalizePhones(pick(requireBody(req), CUSTOMER_FIELDS), PHONES);
  if (!Object.keys(set).length) throw bad('no_fields', CUSTOMER_FIELDS.join(', '));
  const c = await Customer.findOneAndUpdate({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: set }, { new: true, runValidators: true }).lean();
  if (!c) throw notFound('customer_not_found');
  if (set.name || set.phone) { // orders mein rakhi copy bhi badlo
    await Order.updateMany({ shopId: req.shopId, customerId: c._id }, { $set: { customerName: c.name, customerPhone: c.phone } });
  }
  ok(res, await customerDetail(req.shopId, c._id, req.lang));
});

// Query: ?force=true — Body: (udhaar baaki ho to force chahiye)
// DELETE /api/customers/:id
const deleteCustomer = h(async (req, res) => {
  const due = (await duesByCustomer(req.shopId, [req.params.id])).get(req.params.id);
  if (due && due.totalDuePaise > 0 && req.query.force !== 'true') throw conflict('customer_has_due');
  const x = await Customer.updateOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: { deletedAt: new Date() } });
  if (!x.matchedCount) throw notFound('customer_not_found');
  ok(res, { deleted: true });
});

// ---------- Parivar ----------
// POST /api/customers/:id/members
const addMember = h(async (req, res) => {
  const data = pick(requireBody(req), [...MEMBER_FIELDS, '_id']);
  const c = await Customer.findOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null });
  if (!c) throw notFound('customer_not_found');
  c.members.push(data);
  await c.save();
  created(res, c.members[c.members.length - 1]);
});

async function findMember(shopId, memberId) {
  const c = await Customer.findOne({ shopId, deletedAt: null, members: { $elemMatch: { _id: memberId, deletedAt: null } } });
  if (!c) throw notFound('member_not_found');
  return { customer: c, member: c.members.id(memberId) };
}

// PATCH /api/customers/members/:memberId
const updateMember = h(async (req, res) => {
  const set = pick(requireBody(req), MEMBER_FIELDS);
  if (!Object.keys(set).length) throw bad('no_fields', MEMBER_FIELDS.join(', '));
  const { customer, member } = await findMember(req.shopId, req.params.memberId);
  member.set(set);
  await customer.save();
  ok(res, member);
});

// DELETE /api/customers/members/:memberId
const deleteMember = h(async (req, res) => {
  const { customer, member } = await findMember(req.shopId, req.params.memberId);
  member.deletedAt = new Date();
  await customer.save();
  ok(res, { deleted: true });
});

// ---------- Naap ----------
// Query: ?history=true
// GET /api/customers/members/:memberId/measurements
const getMeasurements = h(async (req, res) => {
  const filter = { shopId: req.shopId, memberId: req.params.memberId, deletedAt: null };
  if (req.query.history !== 'true') filter.isCurrent = true;
  const list = await Measurement.find(filter).sort({ version: -1 }).lean();
  const gs = await GarmentType.find({ _id: { $in: [...new Set(list.map((m) => m.garmentTypeId))] } }).lean();
  const byId = new Map(gs.map((g) => [g._id, g]));
  ok(res, list.map((m) => {
    const g = byId.get(m.garmentTypeId) || {};
    return { ...m, garment: i18n.pick(req.lang, g.name, g.nameHi), garmentCode: g.code, _sort: g.sortOrder || 0 };
  }).sort((a, b) => a._sort - b._sort || b.version - a.version).map(({ _sort, ...m }) => m));
});

// {"garmentTypeId","values":{"chest":38,"waist":32},"fitPreference":"regular","inputMethod":"voice","voiceTranscript":"..."}
// Purana naap history mein, naya "current".
// POST /api/customers/members/:memberId/measurements
const saveMeasurement = h(async (req, res) => {
  const body = requireBody(req);
  const values = body.values;
  if (!values || typeof values !== 'object' || !Object.keys(values).length) throw bad('measurement_values_required');
  const g = await findGarment(req.shopId, body.garmentTypeId);
  if (!g || !(g.fields || []).length) throw notFound('garment_fields_not_found');
  const warnings = checkValues(req.lang, g, values);
  const { customer } = await findMember(req.shopId, req.params.memberId);

  const prev = await Measurement.findOneAndUpdate(
    { memberId: req.params.memberId, garmentTypeId: g._id, isCurrent: true, deletedAt: null },
    { $set: { isCurrent: false } },
  ).lean();
  const m = await Measurement.create({
    _id: body.id || undefined, shopId: req.shopId, customerId: customer._id, memberId: req.params.memberId, garmentTypeId: g._id,
    values, unit: body.unit || req.shop.measurementUnit, fitPreference: body.fitPreference || null, notes: body.notes,
    inputMethod: body.inputMethod || 'manual', voiceTranscript: body.voiceTranscript,
    version: prev ? prev.version + 1 : 1, takenByUserId: req.user._id,
  });
  created(res, { measurement: m, warnings });
});

module.exports = {
  getCustomers,
  createCustomer,
  lookupCustomer,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  addMember,
  updateMember,
  deleteMember,
  getMeasurements,
  saveMeasurement,
  duesByCustomer,
  customerDetail,
};
