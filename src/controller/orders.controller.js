// Orders: ek request mein order + kapde + advance + WhatsApp; status, QR scan, UPI link.

const i18n = require('../utils/i18n');
const { Order, Customer, Measurement, Payment, PaymentLink, Shop, FabricTransaction, Fabric } = require('../models');
const { h, ok, created, bad, notFound, pick, paging, queryDate, bodyDate, requireBody, escapeRegex } = require('../utils/http.helpers');
const { checkLimit } = require('../middleware');
const { randomToken } = require('../utils/auth');
const { todayIST, addDays } = require('../utils/dates');
const { orderMessage } = require('../utils/notify');
const { refreshOrder, refreshFabricStock, applyStatus, orderView, garmentsText } = require('../utils/orders');
const { findGarment } = require('./service.controller');
const { localize } = require('../utils/route.helpers');

// Pichli baar is kapde ka jo rate liya, warna kapde ka default rate
async function lastRate(shopId, garment) {
  const o = await Order.findOne({ shopId, deletedAt: null, items: { $elemMatch: { garmentTypeId: garment._id, ratePaise: { $gt: 0 }, deletedAt: null } } })
    .sort({ createdAt: -1 }).select('items').lean();
  const it = o && o.items.filter((i) => i.garmentTypeId === garment._id && i.ratePaise > 0).pop();
  return it ? it.ratePaise : garment.defaultRatePaise || 0;
}

// {"customerId","trialDate","promisedDeliveryDate","items":[{"memberId","garmentTypeId","quantity":2,"ratePaise":80000,
//   "fabricSource":"shop","fabricId","fabricQtyUsed":6,"designNotes":"chinese collar"}],
//  "discountPaise":10000,"advance":{"amountPaise":100000,"mode":"upi"},"sendWhatsApp":true}
// POST /api/orders
const createOrder = h(async (req, res) => {
  const body = requireBody(req);
  const { cfg } = req.app.locals;
  if (!Array.isArray(body.items) || !body.items.length) throw bad('order_items_required');
  await checkLimit(req.shop, 'maxOrdersPerMonth');
  const customer = await Customer.findOne({ _id: body.customerId, shopId: req.shopId, deletedAt: null }).lean();
  if (!customer) throw notFound('customer_not_found');
  const orderType = body.orderType || 'new';
  const trialDate = bodyDate(body.trialDate, 'trialDate');
  const warnings = [];

  // Kapde taiyaar karo: rate, naap ki copy, din
  let maxDays = 0;
  const items = [];
  for (const [n, it] of body.items.entries()) {
    const g = await findGarment(req.shopId, it.garmentTypeId);
    if (!g) throw bad('item_garment_not_found', n + 1);
    const member = (customer.members || []).find((m) => m._id === it.memberId && !m.deletedAt);
    if (!member) throw bad('item_member_mismatch', n + 1);
    const rate = it.ratePaise !== undefined && it.ratePaise !== null ? Number(it.ratePaise) : await lastRate(req.shopId, g);
    if (!Number.isSafeInteger(rate) || rate < 0) throw bad('rate_negative');
    const mq = { memberId: member._id, garmentTypeId: g._id, deletedAt: null };
    if (it.measurementId) mq._id = it.measurementId; else mq.isCurrent = true;
    const ms = await Measurement.findOne(mq).lean();
    if (!ms && orderType === 'new') warnings.push(i18n.t(req.lang, 'warn_no_measurement', i18n.pick(req.lang, g.name, g.nameHi)));
    maxDays = Math.max(maxDays, g.defaultDays || 0);
    items.push({
      _id: it.id || undefined, memberId: member._id, memberName: member.name, memberRelation: member.relation,
      garmentTypeId: g._id, garmentCode: g.code, garmentName: g.name, garmentNameHi: g.nameHi,
      measurementId: ms ? ms._id : null, measurementSnapshot: ms ? ms.values : {},
      quantity: Math.max(parseInt(it.quantity, 10) || 1, 1), ratePaise: rate,
      fabricSource: it.fabricSource || 'customer', fabricId: it.fabricId || null, fabricQtyUsed: it.fabricQtyUsed,
      designId: it.designId || null, designNotes: it.designNotes,
      trialDate: bodyDate(it.trialDate, 'trialDate') || trialDate,
      deliveryDate: bodyDate(it.deliveryDate, 'deliveryDate'),
      qrCode: randomToken(8),
    });
  }
  const discount = Number(body.discountPaise || 0);
  const tax = Number(body.taxPaise || 0);
  const subtotal = items.reduce((s, i) => s + i.quantity * i.ratePaise, 0);
  const total = subtotal - discount + tax;
  if (discount < 0 || total < 0) throw bad('discount_too_high');
  const advance = body.advance && body.advance.amountPaise > 0 ? body.advance : null;
  if (advance && advance.amountPaise > total) throw bad('advance_too_high');

  // Delivery date na di ho to: aaj + sabse lambe kapde ke din
  const promised = bodyDate(body.promisedDeliveryDate, 'promisedDeliveryDate') || addDays(todayIST(), maxDays);
  for (const i of items) i.deliveryDate = i.deliveryDate || promised;
  const shop = await Shop.findByIdAndUpdate(req.shopId, { $inc: { orderCounter: 1 } }, { new: true }).lean();

  const order = await Order.create({
    _id: body.id || undefined, shopId: req.shopId, orderNumber: shop.orderCounter, customerId: customer._id,
    customerName: customer.name, customerPhone: customer.phone, orderType, parentOrderId: body.parentOrderId || null,
    isUrgent: !!body.isUrgent, orderDate: bodyDate(body.orderDate, 'orderDate') || todayIST(), trialDate,
    promisedDeliveryDate: promised, festivalId: body.festivalId || null, subtotalPaise: subtotal,
    discountPaise: discount, taxPaise: tax, totalPaise: total, paidPaise: 0, balancePaise: total,
    trackingToken: randomToken(9), notes: body.notes, createdByUserId: req.user._id, items,
    history: [{ toStatus: 'received', changedByUserId: req.user._id }],
  });

  // Dukaan ka kapda use hua to stock se ghatao
  for (const it of order.items) {
    if (it.fabricSource === 'shop' && it.fabricId && it.fabricQtyUsed > 0) {
      const fab = await Fabric.findOne({ _id: it.fabricId, shopId: req.shopId, deletedAt: null }).lean();
      if (!fab) continue;
      await FabricTransaction.create({ shopId: req.shopId, fabricId: fab._id, txnType: 'used', quantity: -it.fabricQtyUsed,
        orderId: order._id, itemId: it._id, note: `Order #${order.orderNumber}`, createdBy: req.user._id });
      await refreshFabricStock(fab._id);
    }
  }
  if (advance) {
    await Payment.create({ shopId: req.shopId, customerId: customer._id, orderId: order._id, amountPaise: advance.amountPaise,
      purpose: 'advance', mode: advance.mode || 'cash', referenceNo: advance.referenceNo, note: advance.note, receivedByUserId: req.user._id });
    await refreshOrder(order._id);
  }
  let message = null;
  if (body.sendWhatsApp !== false) {
    message = localize(req, await orderMessage(await Order.findById(order._id).lean(), 'order_received', { publicBaseUrl: cfg.publicBaseUrl }));
  }
  created(res, { order: await orderView(req.shopId, order._id, req.lang, cfg.publicBaseUrl), message, warnings });
});

// Query: ?status=received,stitching&from=&to=&customerId=&q=&late=true&due=true&urgent=true&festivalId=&sort=recent
// GET /api/orders
const getOrders = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const q = req.query;
  const today = todayIST();
  const f = { shopId: req.shopId, deletedAt: null };
  if (q.status) f.status = { $in: String(q.status).split(',') };
  const from = queryDate(req, 'from');
  const to = queryDate(req, 'to');
  if (from || to) f.promisedDeliveryDate = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (q.customerId) f.customerId = q.customerId;
  if (q.festivalId) f.festivalId = q.festivalId;
  if (q.urgent === 'true') f.isUrgent = true;
  if (q.due === 'true') { f.balancePaise = { $gt: 0 }; f.status = { $ne: 'cancelled' }; }
  if (q.late === 'true') {
    f.promisedDeliveryDate = { ...(f.promisedDeliveryDate || {}), $lt: today };
    f.status = { $nin: ['ready', 'delivered', 'cancelled'] };
  }
  const search = String(q.q || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    f.$or = [{ customerName: rx }, { customerPhone: rx }];
    if (/^\d+$/.test(search)) f.$or.push({ orderNumber: Number(search) });
  }
  const sort = q.sort === 'recent' ? { createdAt: -1 } : { promisedDeliveryDate: 1, isUrgent: -1, orderNumber: 1 };
  const list = await Order.find(f).sort(sort).skip(offset).limit(limit).lean();
  const items = list.map((o) => ({
    id: o._id, orderNumber: o.orderNumber, status: o.status, orderType: o.orderType, isUrgent: o.isUrgent,
    orderDate: o.orderDate, trialDate: o.trialDate, promisedDeliveryDate: o.promisedDeliveryDate, deliveredAt: o.deliveredAt,
    totalPaise: o.totalPaise, paidPaise: o.paidPaise, balancePaise: o.balancePaise,
    customerId: o.customerId, customerName: o.customerName, customerPhone: o.customerPhone,
    isLate: o.promisedDeliveryDate < today && !['ready', 'delivered', 'cancelled'].includes(o.status),
    garments: garmentsText(req.lang, o.items),
  }));
  ok(res, { items, limit, offset });
});

// GET /api/orders/:id
const getOrderById = h(async (req, res) => ok(res, await orderView(req.shopId, req.params.id, req.lang, req.app.locals.cfg.publicBaseUrl)));

// Body: {trialDate, promisedDeliveryDate, isUrgent, notes, discountPaise, taxPaise, festivalId}
// PATCH /api/orders/:id
const updateOrder = h(async (req, res) => {
  const set = pick(requireBody(req), ['trialDate', 'promisedDeliveryDate', 'isUrgent', 'notes', 'discountPaise', 'taxPaise', 'festivalId']);
  if (!Object.keys(set).length) throw bad('no_fields', 'trialDate, promisedDeliveryDate, isUrgent, notes, discountPaise, taxPaise, festivalId');
  for (const k of ['trialDate', 'promisedDeliveryDate']) if (set[k] !== undefined) set[k] = bodyDate(set[k], k);
  const before = await Order.findOneAndUpdate({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: set }, { runValidators: true }).lean();
  if (!before) throw notFound('order_not_found');
  try {
    await refreshOrder(before._id);
  } catch (e) { // galat discount: purana wapas
    await Order.updateOne({ _id: before._id }, { $set: { discountPaise: before.discountPaise, taxPaise: before.taxPaise } });
    throw e;
  }
  ok(res, await orderView(req.shopId, req.params.id, req.lang, req.app.locals.cfg.publicBaseUrl));
});

async function setStatus(req, res, orderId, itemId, status, note, via) {
  const { cfg } = req.app.locals;
  const order = await Order.findOne({ _id: orderId, shopId: req.shopId, deletedAt: null });
  if (!order) throw notFound('order_not_found');
  const { newStatus, oldStatus } = await applyStatus(order, { itemId, status, note, via, userId: req.user._id });
  let message = null;
  if (newStatus === 'ready' && oldStatus !== 'ready') { // ready hote hi customer ko WhatsApp
    message = localize(req, await orderMessage(orderId, 'order_ready', { publicBaseUrl: cfg.publicBaseUrl, dedupeKey: 'ready:' + orderId }));
  }
  ok(res, { order: await orderView(req.shopId, orderId, req.lang, cfg.publicBaseUrl), message });
}

// Body: {"status":"ready","itemId":null,"note":""}
// POST /api/orders/:id/status
const updateOrderStatus = h(async (req, res) => {
  const b = requireBody(req);
  await setStatus(req, res, req.params.id, b.itemId || null, b.status, b.note, 'app');
});

// Body: {"status":"stitching"} — order tag ka QR scan (status na do to sirf jaankari)
// POST /api/orders/scan/:qr
const scanQr = h(async (req, res) => {
  const o = await Order.findOne({ shopId: req.shopId, deletedAt: null, 'items.qrCode': req.params.qr }).select('items').lean();
  if (!o) throw notFound('qr_not_found');
  const item = o.items.find((i) => i.qrCode === req.params.qr);
  const b = req.body || {};
  if (!b.status) return ok(res, { itemId: item._id, order: await orderView(req.shopId, o._id, req.lang, req.app.locals.cfg.publicBaseUrl) });
  await setStatus(req, res, o._id, item._id, b.status, b.note, 'qr_scan');
});

// Body: {"event":"payment_due"} — manual "WhatsApp bhejo"
// POST /api/orders/:id/notify
const notifyCustomer = h(async (req, res) => {
  const ev = requireBody(req).event;
  if (!['order_received', 'order_ready', 'trial_reminder', 'delivery_reminder', 'payment_due', 'payment_received'].includes(ev)) throw bad('event_invalid');
  const o = await Order.findOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null }).lean();
  if (!o) throw notFound('order_not_found');
  ok(res, localize(req, await orderMessage(o, ev, { publicBaseUrl: req.app.locals.cfg.publicBaseUrl, manual: true })));
});

// Body: {quantity, ratePaise, designId, designNotes, trialDate, deliveryDate}
// PATCH /api/orders/items/:itemId
const updateOrderItem = h(async (req, res) => {
  const set = pick(requireBody(req), ['quantity', 'ratePaise', 'designId', 'designNotes', 'trialDate', 'deliveryDate']);
  if (!Object.keys(set).length) throw bad('no_fields', 'quantity, ratePaise, designId, designNotes, trialDate, deliveryDate');
  for (const k of ['trialDate', 'deliveryDate']) if (set[k] !== undefined) set[k] = bodyDate(set[k], k);
  const order = await Order.findOne({ shopId: req.shopId, deletedAt: null, 'items._id': req.params.itemId });
  if (!order) throw notFound('item_not_in_order');
  const item = order.items.id(req.params.itemId);
  const before = { quantity: item.quantity, ratePaise: item.ratePaise };
  item.set(set);
  await order.save();
  try {
    await refreshOrder(order._id);
  } catch (e) {
    item.set(before);
    await order.save();
    throw e;
  }
  ok(res, order.items.id(req.params.itemId));
});

// UPI deep link (GPay, PhonePe, Paytm). VPA encode nahi — kuch apps "%40" nahi samajhte.
function upiUri(vpa, payee, paise, note) {
  return `upi://pay?pa=${String(vpa).trim()}&pn=${encodeURIComponent(payee)}&am=${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}&cu=INR&tn=${encodeURIComponent(note)}`;
}

// Body: {"amountPaise"} (na do to poora baaki)
// WhatsApp mein upi:// click nahi hota — customer tracking link par "Pay" button se yahi khulta hai.
// POST /api/orders/:id/payment-link
const createPaymentLink = h(async (req, res) => {
  const o = await Order.findOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null }).lean();
  if (!o) throw notFound('order_not_found');
  if (!req.shop.upiId) throw bad('upi_missing');
  const amount = req.body && req.body.amountPaise !== undefined ? Number(req.body.amountPaise) : o.balancePaise;
  if (!(amount > 0) || amount > o.balancePaise) throw bad('order_no_balance');
  const link = await PaymentLink.create({ shopId: req.shopId, customerId: o.customerId, orderId: o._id, amountPaise: amount,
    upiUri: upiUri(req.shop.upiId, req.shop.name, amount, o.orderNumber ? `Order ${o.orderNumber}` : 'Order') });
  created(res, link);
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  updateOrderStatus,
  scanQr,
  notifyCustomer,
  updateOrderItem,
  createPaymentLink,
  upiUri,
};
