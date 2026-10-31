// ======================= ONLINE DUKAAN (shop app) =======================
// Mount: /api/online  —  Login + X-Shop-Id + "bookings" permission (settings badalne ke liye "settings")
// Online profile, working hours, booking ke niyam, booking requests, din ka view, slot band karna, waitlist, reviews.

const { Shop, Booking, SlotBlock, Waitlist, Review, Order } = require('../models');
const { h, ok, created, bad, notFound, conflict, requireBody, paging, queryDate } = require('../utils/http.helpers');
const { todayIST, addDays, isDateStr } = require('../utils/dates');
const online = require('../utils/online');
const bk = require('../utils/bookings');

const reloadShop = (id) => Shop.findById(id).lean();

// Sab settings ek saath (screens isi se bharti hain)
async function settingsView(shop) {
  const st = online.settingsOf(shop);
  const f = await online.featuresFor(shop);
  const geo = shop.geo && shop.geo.coordinates ? { lat: shop.geo.coordinates[1], lng: shop.geo.coordinates[0] } : null;
  const missing = [];
  if (!geo) missing.push('location');
  if (!st.profile.categories.length) missing.push('categories');
  if (!shop.phone) missing.push('phone');
  if (!st.profile.photos.length && !shop.logoUrl) missing.push('photos');
  return {
    profile: st.profile, hours: st.hours, rules: st.rules, rating: st.rating, location: geo,
    shop: { name: shop.name, phone: shop.phone || null, address: shop.address || null, city: shop.city || null, logoUrl: shop.logoUrl || null, upiId: shop.upiId || null, verified: !!shop.verifiedAt },
    tier: f.tier, features: f.features, limits: f.adminRules, categories: online.CATEGORIES,
    missing, // online chalu karne se pehle ye bharna zaroori
  };
}

// GET /api/online/settings
const getSettings = h(async (req, res) => ok(res, await settingsView(req.shop)));

// Body: {"enabled":true,"about":"...","categories":["gents"],"services":[{"name":"Shirt","fromPaise":45000}],"photos":["https://..."],
//        "homeVisit":false,"area":"Model Town","location":{"lat":30.37,"lng":76.78}}
// PUT /api/online/profile
const putProfile = h(async (req, res) => {
  const b = requireBody(req);
  const p = online.validateProfile(b);
  if (p.error) throw bad(p.error, ...(p.arg ? [p.arg] : []));
  const loc = online.validateLocation(b);
  if (loc.error) throw bad(loc.error);
  const set = {};
  for (const [k, v] of Object.entries(p.set)) set[`online.profile.${k}`] = v;
  const upd = { $set: set };
  if (loc.geo) set.geo = loc.geo;
  if (loc.geo === null) upd.$unset = { geo: 1 };
  // Chalu karne se pehle: jagah + kaam (category) + phone zaroori
  if (p.set.enabled) {
    const after = { ...req.shop, geo: loc.geo === undefined ? req.shop.geo : loc.geo, online: { ...(req.shop.online || {}), profile: { ...online.settingsOf(req.shop).profile, ...p.set } } };
    const v = await settingsView(after);
    const must = v.missing.filter((m) => m !== 'photos');
    if (must.length) throw bad('online_incomplete', must.join(', '));
  }
  if (!Object.keys(set).length && !upd.$unset) throw bad('no_fields', 'enabled, about, categories, services, photos, homeVisit, area, location');
  await Shop.updateOne({ _id: req.shopId }, upd);
  ok(res, await settingsView(await reloadShop(req.shopId)));
});

// Body: {"days":{"0":{"open":false},"1":{"open":true,"from":"11:00","to":"20:00"}},"breaks":[{"from":"14:00","to":"15:00"}],
//        "slotMinutes":30,"perSlot":2,"maxPerDay":8,"paused":false,"holidays":["2026-11-01"],"minLeadMinutes":60,"windowDays":30}
// PUT /api/online/hours
const putHours = h(async (req, res) => {
  const cur = online.settingsOf(req.shop).hours;
  const v = online.validateHours(requireBody(req), cur);
  if (v.error) throw bad(v.error, ...(v.arg ? [v.arg] : []));
  if (!Object.keys(v.set).length) throw bad('no_fields', 'days, breaks, slotMinutes, perSlot, maxPerDay, paused, holidays, minLeadMinutes, windowDays, earliestDeliveryDays');
  const set = {};
  for (const [k, val] of Object.entries(v.set)) set[`online.hours.${k}`] = val;
  await Shop.updateOne({ _id: req.shopId }, { $set: set });
  ok(res, await settingsView(await reloadShop(req.shopId)));
});

// Body: {"dates":["2026-11-01","2026-11-02"]} — chhutti jodo  |  DELETE /api/online/holidays/2026-11-01
// POST /api/online/holidays
const addHolidays = h(async (req, res) => {
  const dates = requireBody(req).dates;
  if (!Array.isArray(dates) || !dates.length || dates.some((d) => !isDateStr(d))) throw bad('date_format', 'dates');
  const cur = online.settingsOf(req.shop).hours.holidays;
  const v = online.validateHours({ holidays: [...cur, ...dates] }, online.settingsOf(req.shop).hours);
  if (v.error) throw bad(v.error, v.arg);
  await Shop.updateOne({ _id: req.shopId }, { $set: { 'online.hours.holidays': v.set.holidays } });
  ok(res, { holidays: v.set.holidays });
});
const removeHoliday = h(async (req, res) => {
  const cur = online.settingsOf(req.shop).hours.holidays.filter((d) => d !== req.params.date);
  await Shop.updateOne({ _id: req.shopId }, { $set: { 'online.hours.holidays': cur } });
  ok(res, { holidays: cur });
});

// Body: {"autoConfirm":true,"advanceType":"fixed|pct|none","advanceValue":20000,"freeCancelHours":4,"maxReschedules":2,"responseHours":2,"autoOfferWaitlist":true}
//   advanceValue: fixed = paise, pct = %
// PUT /api/online/rules
const putRules = h(async (req, res) => {
  const { adminRules } = await online.featuresFor(req.shop);
  const v = online.validateRules(requireBody(req), adminRules);
  if (v.error) throw bad(v.error, ...(v.arg !== undefined ? [v.arg] : []));
  const merged = { ...online.settingsOf(req.shop).rules, ...v.set };
  if (merged.advanceType === 'pct' && merged.advanceValue > adminRules.maxAdvancePct) throw bad('advance_pct_too_high', adminRules.maxAdvancePct);
  if (!Object.keys(v.set).length) throw bad('no_fields', 'autoConfirm, advanceType, advanceValue, freeCancelHours, maxReschedules, responseHours, autoOfferWaitlist');
  const set = {};
  for (const [k, val] of Object.entries(v.set)) set[`online.rules.${k}`] = val;
  await Shop.updateOne({ _id: req.shopId }, { $set: set });
  ok(res, await settingsView(await reloadShop(req.shopId)));
});

// ---------------------------------------------------------------- calendar
// Din ka view: har slot + uski bookings / band / khaali
// Query: ?date=2026-11-05&days=1 (max 7)
// GET /api/online/calendar
const calendar = h(async (req, res) => {
  const date = queryDate(req, 'date') || todayIST();
  const days = Math.min(7, Math.max(1, parseInt(req.query.days, 10) || 1));
  ok(res, await online.slotsFor(req.shop, date, days, { detail: true }));
});

// Mahine ka saar (calendar par rang): ?from=2026-11-01&days=31
// GET /api/online/month
const month = h(async (req, res) => {
  const from = queryDate(req, 'from') || todayIST();
  const days = Math.min(42, Math.max(1, parseInt(req.query.days, 10) || 31));
  const list = await online.slotsFor(req.shop, from, days, {});
  const counts = await Booking.aggregate([{ $match: { shopId: req.shopId, date: { $gte: from, $lte: addDays(from, days - 1) }, status: { $in: ['pending', 'confirmed'] } } },
    { $group: { _id: '$date', n: { $sum: 1 } } }]);
  const byDate = new Map(counts.map((c) => [c._id, c.n]));
  ok(res, list.map((d) => ({ date: d.date, status: d.status, reason: d.reason, bookings: byDate.get(d.date) || 0, freeSlots: d.slots.filter((s) => s.left > 0).length })));
});

// Body: {"date":"2026-11-05","time":"11:30","note":"walk-in"}
// POST /api/online/blocks
const addBlock = h(async (req, res) => {
  const b = requireBody(req);
  if (!isDateStr(b.date) || !online.HHMM.test(String(b.time))) throw bad('invalid_value', 'date, time');
  try {
    created(res, await SlotBlock.create({ shopId: req.shopId, date: b.date, time: b.time, note: b.note ? String(b.note).slice(0, 120) : undefined, createdBy: req.user._id }));
  } catch (e) {
    if (e && e.code === 11000) throw conflict('slot_already_blocked');
    throw e;
  }
});

// DELETE /api/online/blocks/:id  (khulte hi waitlist ko offer)
const removeBlock = h(async (req, res) => {
  const blk = await SlotBlock.findOneAndDelete({ _id: req.params.id, shopId: req.shopId }).lean();
  if (!blk) throw notFound();
  await bk.offerFreedSlot(req.shop, blk.date, blk.time);
  ok(res, { id: blk._id, deleted: true });
});

// ---------------------------------------------------------------- bookings
// Query: ?view=pending|upcoming|today|past|all&date=2026-11-05&q=
// GET /api/online/bookings
const listBookings = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const today = todayIST();
  const view = req.query.view || 'upcoming';
  const f = { shopId: req.shopId };
  let sort = { startsAt: 1 };
  if (view === 'pending') f.status = 'pending';
  else if (view === 'upcoming') { f.status = { $in: ['pending', 'confirmed'] }; f.startsAt = { $gte: new Date(Date.now() - 2 * 3600000) }; }
  else if (view === 'today') { f.date = today; f.status = { $in: ['pending', 'confirmed', 'completed', 'no_show'] }; }
  else if (view === 'past') { f.$or = [{ status: { $nin: ['pending', 'confirmed'] } }, { startsAt: { $lt: new Date(Date.now() - 2 * 3600000) } }]; sort = { startsAt: -1 }; }
  else sort = { startsAt: -1 };
  const date = queryDate(req, 'date');
  if (date) f.date = date;
  if (req.query.q) {
    const r = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$and = [{ $or: [{ 'customer.name': r }, { 'customer.phone': r }] }];
  }
  const [items, total, pending, todayCount] = await Promise.all([
    Booking.find(f).sort(sort).skip(offset).limit(limit).select('-history').lean(),
    Booking.countDocuments(f),
    Booking.countDocuments({ shopId: req.shopId, status: 'pending' }),
    Booking.countDocuments({ shopId: req.shopId, date: today, status: { $in: ['pending', 'confirmed'] } }),
  ]);
  ok(res, { items, total, limit, offset, counts: { pending, today: todayCount } });
});

async function own(req) {
  const b = await Booking.findOne({ _id: req.params.id, shopId: req.shopId }).lean();
  if (!b) throw notFound('booking_not_found');
  return b;
}

// GET /api/online/bookings/:id
const getBooking = h(async (req, res) => {
  const b = await own(req);
  const review = b.reviewId ? await Review.findById(b.reviewId).lean() : null;
  const past = await Booking.countDocuments({ shopId: req.shopId, userId: b.userId, status: 'completed', _id: { $ne: b._id } });
  ok(res, { ...b, review, visitsBefore: past });
});

const by = (req) => 'shop:' + req.user._id;
function stateErr(b) { return conflict('booking_state', b.status); }

// POST /api/online/bookings/:id/accept
const accept = h(async (req, res) => {
  const b = await own(req);
  const x = await bk.transition(b._id, ['pending'], { status: 'confirmed', decidedAt: new Date(), respondBy: null }, { by: by(req), action: 'accepted' });
  if (!x) throw stateErr(b);
  await bk.linkCustomer(req.shop, x);
  await bk.notifyUser(x.userId, 'booking_confirmed', 'notif_bk_confirmed', x, req.shop.name);
  ok(res, await Booking.findById(x._id).lean());
});

// Body: {"reason":"Fully booked that day"}
// POST /api/online/bookings/:id/decline
const decline = h(async (req, res) => {
  const b = await own(req);
  const reason = String((req.body && req.body.reason) || '').slice(0, 200);
  const x = await bk.transition(b._id, ['pending'], { status: 'declined', decidedAt: new Date(), cancelledBy: 'shop', reason, ...bk.advanceAfter(b, 'refund') }, { by: by(req), action: 'declined', note: reason });
  if (!x) throw stateErr(b);
  await bk.notifyUser(x.userId, 'booking_declined', 'notif_bk_declined', x, req.shop.name, { reason });
  await bk.offerFreedSlot(req.shop, x.date, x.time);
  ok(res, x);
});

// Dukaan ne confirm booking cancel ki (advance hamesha wapas)
// POST /api/online/bookings/:id/cancel
const cancel = h(async (req, res) => {
  const b = await own(req);
  const reason = String((req.body && req.body.reason) || '').slice(0, 200);
  const x = await bk.transition(b._id, ['confirmed', 'pending'], { status: 'cancelled', cancelledBy: 'shop', reason, ...bk.advanceAfter(b, 'refund') }, { by: by(req), action: 'cancelled', note: reason });
  if (!x) throw stateErr(b);
  await bk.notifyUser(x.userId, 'booking_cancelled', 'notif_bk_cancelled_shop', x, req.shop.name, { reason });
  await bk.offerFreedSlot(req.shop, x.date, x.time);
  ok(res, x);
});

// Customer aaya (naap ho gaya) — review dene ka mauka
// POST /api/online/bookings/:id/complete
const complete = h(async (req, res) => {
  const b = await own(req);
  const x = await bk.transition(b._id, ['confirmed'], { status: 'completed' }, { by: by(req), action: 'completed' });
  if (!x) throw stateErr(b);
  await bk.linkCustomer(req.shop, x);
  await bk.notifyUser(x.userId, 'booking_completed', 'notif_bk_completed', x, req.shop.name);
  ok(res, await Booking.findById(x._id).lean());
});

// Customer nahi aaya (time nikal gaya ho tab) — advance dukaan ka
// POST /api/online/bookings/:id/no-show
const noShow = h(async (req, res) => {
  const b = await own(req);
  if (new Date(b.startsAt) > new Date()) throw bad('booking_not_started');
  const x = await bk.transition(b._id, ['confirmed'], { status: 'no_show', ...bk.advanceAfter(b, 'keep') }, { by: by(req), action: 'no_show' });
  if (!x) throw stateErr(b);
  ok(res, x);
});

// Advance UPI par mil gaya / wapas kar diya
// POST /api/online/bookings/:id/advance-received   |   /advance-refunded
const advanceReceived = h(async (req, res) => {
  const b = await own(req);
  const x = await Booking.findOneAndUpdate({ _id: b._id, 'advance.status': { $in: ['due', 'claimed'] } },
    { $set: { 'advance.status': 'received', 'advance.updatedAt': new Date() }, $push: { history: { at: new Date(), by: by(req), action: 'advance_received' } } }, { new: true }).lean();
  if (!x) throw conflict('booking_state', (b.advance || {}).status || 'none');
  ok(res, x);
});
const advanceRefunded = h(async (req, res) => {
  const b = await own(req);
  const x = await Booking.findOneAndUpdate({ _id: b._id, 'advance.status': 'refund_due' },
    { $set: { 'advance.status': 'refunded', 'advance.updatedAt': new Date() }, $push: { history: { at: new Date(), by: by(req), action: 'advance_refunded' } } }, { new: true }).lean();
  if (!x) throw conflict('booking_state', (b.advance || {}).status || 'none');
  ok(res, x);
});

// Booking se bana order jodo: {"orderId":"..."}
// POST /api/online/bookings/:id/link-order
const linkOrder = h(async (req, res) => {
  const b = await own(req);
  const orderId = String(requireBody(req).orderId || '');
  if (!(await Order.exists({ _id: orderId, shopId: req.shopId, deletedAt: null }))) throw notFound('order_not_found');
  ok(res, await Booking.findByIdAndUpdate(b._id, { $set: { orderId }, $push: { history: { at: new Date(), by: by(req), action: 'order_linked' } } }, { new: true }).lean());
});

// ---------------------------------------------------------------- waitlist + reviews
// GET /api/online/waitlist?date=
const listWaitlist = h(async (req, res) => {
  const f = { shopId: req.shopId, status: { $in: ['waiting', 'offered'] }, date: { $gte: todayIST() } };
  const date = queryDate(req, 'date');
  if (date) f.date = date;
  ok(res, await Waitlist.find(f).sort({ date: 1, createdAt: 1 }).limit(200).lean());
});

// GET /api/online/reviews
const listReviews = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const [items, total] = await Promise.all([
    Review.find({ shopId: req.shopId }).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    Review.countDocuments({ shopId: req.shopId }),
  ]);
  ok(res, { items, total, limit, offset, rating: online.settingsOf(req.shop).rating });
});

// Body: {"text":"Thank you!"} (khaali = jawab hatao)
// POST /api/online/reviews/:id/reply
const replyReview = h(async (req, res) => {
  const text = String(requireBody(req).text || '').trim().slice(0, 500);
  const r = await Review.findOneAndUpdate({ _id: req.params.id, shopId: req.shopId }, text ? { $set: { reply: { text, at: new Date() } } } : { $unset: { reply: 1 } }, { new: true }).lean();
  if (!r) throw notFound();
  ok(res, r);
});

module.exports = {
  getSettings, putProfile, putHours, addHolidays, removeHoliday, putRules,
  calendar, month, addBlock, removeBlock,
  listBookings, getBooking, accept, decline, cancel, complete, noShow, advanceReceived, advanceRefunded, linkOrder,
  listWaitlist, listReviews, replyReview,
};
