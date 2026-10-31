// Booking ke kaam jo dukaan, customer aur worker teeno karte hain:
// status badalna (history ke saath), notification, waitlist ko khaali slot dena, dukaan ki customer list mein jodna.
const M = require('../models');
const i18n = require('./i18n');
const { istDateTime } = require('./dates');
const online = require('./online');
const marketplace = require('./marketplace');

const { Booking, Waitlist, Customer, Notification, UserNotification, Shop, User } = M;

const shopLang = (shop) => i18n.parse(shop && shop.defaultLanguage) || i18n.DEFAULT;
const userLang = (u) => i18n.parse(u && u.preferredLanguage) || i18n.DEFAULT;
const when = (lang, b) => `${i18n.date(lang, b.date)}, ${b.time}`;

async function notifyShop(shop, type, key, b, extra = {}) {
  const l = shopLang(shop);
  await Notification.create({ shopId: shop._id, type, title: i18n.t(l, key + '_title', b.customer.name, when(l, b)),
    body: i18n.t(l, key + '_body', b.customer.name, when(l, b), extra.reason || ''), data: { bookingId: b._id, number: b.number } });
}

async function notifyUser(userId, type, key, b, shopName, extra = {}) {
  const u = await User.findById(userId).select('preferredLanguage').lean();
  const l = userLang(u);
  const t = extra.time ? { ...b, time: extra.time, date: extra.date || b.date } : b;
  await UserNotification.create({ userId, type, title: i18n.t(l, key + '_title', shopName, when(l, t)),
    body: i18n.t(l, key + '_body', shopName, when(l, t), extra.reason || ''), data: { bookingId: b._id, waitlistId: extra.waitlistId, shopId: b.shopId } });
}

// status badlo — sirf jab abhi wala status `from` mein ho (do log ek saath dabayein to ek hi jeete)
async function transition(id, from, set, { by, action, note } = {}) {
  return Booking.findOneAndUpdate({ _id: id, status: { $in: from } },
    { $set: set, $push: { history: { at: new Date(), by, action, note } } }, { new: true }).lean();
}

// Dukaan ki customer list mein (phone se) — confirm hote hi
async function linkCustomer(shop, b) {
  if (b.customerId) return b.customerId;
  let c = await Customer.findOne({ shopId: shop._id, phone: b.customer.phone, deletedAt: null }).select('_id').lean();
  if (!c) {
    try {
      c = await Customer.create({ shopId: shop._id, name: b.customer.name, phone: b.customer.phone, source: 'u_like_tailor_app',
        whatsappOptIn: b.customer.whatsapp !== false, notes: 'Booked on U Like Tailor app' });
    } catch (e) {
      if (e && e.code === 11000) c = await Customer.findOne({ shopId: shop._id, phone: b.customer.phone, deletedAt: null }).select('_id').lean();
      else throw e;
    }
  }
  if (c) await Booking.updateOne({ _id: b._id }, { $set: { customerId: c._id } });
  return c && c._id;
}

// Khaali hua slot waitlist mein pehle wale ko (feature + dukaan ki setting chalu ho to)
async function offerFreedSlot(shop, date, time, now = new Date()) {
  const st = online.settingsOf(shop);
  if (!st.rules.autoOfferWaitlist) return null;
  const { features, adminRules } = await online.featuresFor(shop);
  if (!features.waitlist) return null;
  if (!(await online.slotOpen(shop, date, time, { now }))) return null;
  const part = online.partOf(time);
  const w = await Waitlist.findOneAndUpdate(
    { shopId: shop._id, date, status: 'waiting', parts: part },
    { $set: { status: 'offered', offer: { time, expiresAt: new Date(now.getTime() + adminRules.waitlistOfferMinutes * 60000) } } },
    { sort: { createdAt: 1 }, new: true },
  ).lean();
  if (!w) return null;
  await notifyUser(w.userId, 'waitlist_offer', 'notif_wait_offer', { _id: null, shopId: shop._id, date, time }, shop.name, { waitlistId: w._id, time, date });
  return w;
}

// Advance ka kya hoga jab booking khatam ho
function advanceAfter(b, kind) {
  const s = b.advance && b.advance.status;
  if (!s || s === 'none') return {};
  if (kind === 'refund') return s === 'received' || s === 'claimed' ? { 'advance.status': 'refund_due', 'advance.updatedAt': new Date() } : { 'advance.status': 'none', 'advance.updatedAt': new Date() };
  if (kind === 'keep') return s === 'received' || s === 'claimed' ? { 'advance.status': 'kept', 'advance.updatedAt': new Date() } : { 'advance.status': 'none', 'advance.updatedAt': new Date() };
  return {};
}

// Customer cancel: free window ke andar? (andar = advance wapas)
function freeCancel(shop, b, now = new Date()) {
  const st = online.settingsOf(shop);
  return now.getTime() <= new Date(b.startsAt).getTime() - st.rules.freeCancelHours * 3600000;
}

// Commission ki setting (booking ke waqt) — abhi off = 0
async function commissionSnapshot(tier) {
  const c = (await marketplace.getConfig()).commission;
  const live = !!(c.enabled && (!c.startsAt || new Date(c.startsAt) <= new Date()));
  const zero = !live || (c.proZero && tier === 'pro');
  return { enabled: live, stitchingPct: zero ? 0 : c.stitchingPct, fabricPct: zero ? 0 : c.fabricPct, newCustomersOnly: c.newCustomersOnly, paise: 0 };
}

// ------------------------------------------------ worker: har minute
// 1) pending jinka jawab nahi aaya -> expired  2) waitlist offer ka time khatam -> agla  3) customer ko yaad dilana
async function bookingJobs(now = new Date()) {
  const out = { expired: 0, offersExpired: 0, reminders: 0 };
  const late = await Booking.find({ status: 'pending', respondBy: { $lt: now } }).limit(200).lean();
  for (const b of late) {
    const x = await transition(b._id, ['pending'], { status: 'expired', decidedAt: now, cancelledBy: 'system', ...advanceAfter(b, 'refund') }, { by: 'system', action: 'expired' });
    if (!x) continue;
    out.expired++;
    const shop = await Shop.findById(b.shopId).lean();
    if (shop) {
      await notifyUser(b.userId, 'booking_expired', 'notif_bk_expired', b, shop.name);
      await offerFreedSlot(shop, b.date, b.time, now);
    }
  }
  const offers = await Waitlist.find({ status: 'offered', 'offer.expiresAt': { $lt: now } }).limit(200).lean();
  for (const w of offers) {
    const r = await Waitlist.updateOne({ _id: w._id, status: 'offered' }, { $set: { status: 'expired' } });
    if (!r.modifiedCount) continue;
    out.offersExpired++;
    const shop = await Shop.findById(w.shopId).lean();
    if (shop) await offerFreedSlot(shop, w.date, w.offer.time, now);
  }
  // Yaad dilana: 1 din pehle (raat 9 se subah 8 ke beech nahi) aur 2 ghante pehle
  const hourIST = Number(new Date(now.getTime() + 330 * 60000).toISOString().slice(11, 13));
  const quiet = hourIST >= 21 || hourIST < 8;
  const soon = await Booking.find({ status: 'confirmed', startsAt: { $gt: now, $lt: new Date(now.getTime() + 24 * 3600000) },
    $or: [{ 'reminded.d1': false }, { 'reminded.h2': false }] }).limit(300).lean();
  for (const b of soon) {
    const left = new Date(b.startsAt) - now;
    let key = null;
    if (left <= 2 * 3600000 && !b.reminded.h2) key = 'h2';
    else if (left > 2 * 3600000 && !b.reminded.d1 && !quiet) key = 'd1';
    if (!key) continue;
    const r = await Booking.updateOne({ _id: b._id, [`reminded.${key}`]: false }, { $set: { [`reminded.${key}`]: true, ...(key === 'h2' && { 'reminded.d1': true }) } });
    if (!r.modifiedCount) continue;
    const shop = await Shop.findById(b.shopId).select('name').lean();
    await notifyUser(b.userId, 'booking_reminder', key === 'h2' ? 'notif_bk_soon' : 'notif_bk_tomorrow', b, shop ? shop.name : '');
    out.reminders++;
  }
  return out;
}

// Dukaan ki rating dobara gino (chhupe review nahi)
async function refreshRating(shopId) {
  const [r] = await M.Review.aggregate([{ $match: { shopId, hiddenAt: null } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  const rating = { avg: r ? Math.round(r.avg * 10) / 10 : 0, count: r ? r.count : 0 };
  await Shop.updateOne({ _id: shopId }, { $set: { 'online.rating': rating } });
  return rating;
}

const startsAtOf = (date, time) => istDateTime(date, time);

module.exports = { notifyShop, notifyUser, transition, linkCustomer, offerFreedSlot, advanceAfter, freeCancel, commissionSnapshot, bookingJobs, refreshRating, startsAtOf };
