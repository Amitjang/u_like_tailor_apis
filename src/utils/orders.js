// Orders ke common kaam: totals, status badalna, order ka poora view.
const i18n = require('./i18n');
const { Order, Payment, WorkAssignment, Staff, Media, User, FabricTransaction, Fabric } = require('../models');
const { bad, notFound, conflict } = require('./http.helpers');

const RANK = ['received', 'cutting', 'stitching', 'trial', 'ready', 'delivered'];

// Fabric ka stock = uske saare transactions ka jod (hamesha sahi)
async function refreshFabricStock(fabricId) {
  const [s] = await FabricTransaction.aggregate([
    { $match: { fabricId, deletedAt: null } },
    { $group: { _id: null, q: { $sum: '$quantity' } } },
  ]);
  const qty = s ? Math.round(s.q * 100) / 100 : 0;
  await Fabric.updateOne({ _id: fabricId }, { $set: { stockQty: qty } });
  return qty;
}

// Order ka hisaab dobara: subtotal (items se), paid (payments se), balance
async function refreshOrder(orderId) {
  const o = await Order.findById(orderId).lean();
  if (!o) return null;
  const subtotal = (o.items || []).filter((i) => !i.deletedAt && i.status !== 'cancelled').reduce((s, i) => s + i.amountPaise, 0);
  const total = subtotal - (o.discountPaise || 0) + (o.taxPaise || 0);
  if (total < 0) throw bad('discount_too_high');
  const [p] = await Payment.aggregate([
    { $match: { orderId, deletedAt: null } },
    { $group: { _id: null, s: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$amountPaise', { $multiply: ['$amountPaise', -1] }] } } } },
  ]);
  const paid = p ? p.s : 0;
  await Order.updateOne({ _id: orderId }, { $set: { subtotalPaise: subtotal, totalPaise: total, paidPaise: paid, balancePaise: total - paid } });
  return { subtotalPaise: subtotal, totalPaise: total, paidPaise: paid, balancePaise: total - paid };
}

// Item ya poore order ka status badlo (mongoose document par). Order ka status = sabse peeche wala item.
// Return: { newStatus, oldStatus }
async function applyStatus(order, { itemId, status, note, via = 'app', userId }) {
  if (!RANK.includes(status) && status !== 'cancelled') throw bad('status_invalid');
  const oldStatus = order.status;
  if (oldStatus === 'cancelled') throw conflict('order_cancelled_locked');
  let newStatus;
  if (itemId) {
    const item = order.items.id(itemId);
    if (!item || item.deletedAt) throw notFound('item_not_in_order');
    order.history.push({ itemId, fromStatus: item.status, toStatus: status, changedByUserId: userId, via, note: note || undefined });
    item.status = status;
    const live = order.items.filter((i) => !i.deletedAt && i.status !== 'cancelled');
    newStatus = live.length ? live.map((i) => i.status).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0] : 'cancelled';
  } else {
    newStatus = status;
    for (const i of order.items) if (!i.deletedAt && i.status !== 'cancelled') i.status = status;
  }
  if (newStatus !== oldStatus) {
    order.status = newStatus;
    order.deliveredAt = newStatus === 'delivered' ? new Date() : null;
    if (newStatus === 'cancelled' && note) order.cancelledReason = note;
    order.history.push({ itemId: null, fromStatus: oldStatus, toStatus: newStatus, changedByUserId: userId, via, note: note || undefined });
  }
  await order.save();
  if (newStatus === 'cancelled') {
    // Cancel par dukaan ka kapda wapas stock mein
    const used = await FabricTransaction.find({ orderId: order._id, txnType: 'used', deletedAt: null }).lean();
    for (const t of used) {
      await FabricTransaction.create({ shopId: t.shopId, fabricId: t.fabricId, txnType: 'return', quantity: -t.quantity, orderId: t.orderId, itemId: t.itemId, note: 'Order cancel' });
      await refreshFabricStock(t.fabricId);
    }
  } else {
    await refreshOrder(order._id);
  }
  return { newStatus, oldStatus };
}

const garmentName = (lang, it) => i18n.pick(lang, it.garmentName, it.garmentNameHi);

function garmentsText(lang, items) {
  return (items || []).filter((i) => !i.deletedAt).map((i) => garmentName(lang, i) + (i.quantity > 1 ? ` x${i.quantity}` : '')).join(', ');
}

// Poora order: items (bhasha mein kapde), payments, history, photos, karigar ka kaam
async function orderView(shopId, id, lang, publicBaseUrl) {
  const o = await Order.findOne({ _id: id, shopId, deletedAt: null }).lean();
  if (!o) throw notFound('order_not_found');
  const [payments, work, media] = await Promise.all([
    Payment.find({ orderId: id, deletedAt: null }).sort({ receivedAt: 1 }).lean(),
    WorkAssignment.find({ orderId: id, deletedAt: null }).sort({ assignedAt: 1 }).lean(),
    Media.find({ shopId, deletedAt: null, $or: [{ entityType: 'order', entityId: id }, { entityType: 'order_item', entityId: { $in: o.items.map((i) => i._id) } }] }).lean(),
  ]);
  const staff = await Staff.find({ _id: { $in: work.map((w) => w.staffId) } }).select('name').lean();
  const staffName = new Map(staff.map((s) => [s._id, s.name]));
  const users = await User.find({ _id: { $in: (o.history || []).map((x) => x.changedByUserId).filter(Boolean) } }).select('name').lean();
  const userName = new Map(users.map((u) => [u._id, u.name]));
  const { Customer } = require('../models');
  const c = await Customer.findById(o.customerId).select('name phone whatsappPhone preferredLanguage').lean();
  return {
    ...o,
    trackingUrl: `${publicBaseUrl}/t/${o.trackingToken}`,
    customer: c,
    items: o.items.filter((i) => !i.deletedAt).map((i) => ({
      ...i,
      garment: garmentName(lang, i),
      assignments: work.filter((w) => w.itemId === i._id).map((w) => ({
        id: w._id, staffId: w.staffId, staffName: staffName.get(w.staffId), task: w.task, status: w.status,
        quantity: w.quantity, amountPaise: w.amountPaise, dueDate: w.dueDate,
      })),
    })),
    payments,
    history: (o.history || []).map((x) => ({ from: x.fromStatus, to: x.toStatus, itemId: x.itemId, note: x.note, via: x.via, at: x.at, by: userName.get(x.changedByUserId) || null })),
    media,
  };
}

module.exports = { RANK, refreshOrder, refreshFabricStock, applyStatus, orderView, garmentName, garmentsText };
