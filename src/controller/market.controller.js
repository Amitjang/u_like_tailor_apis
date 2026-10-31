// ======================= CUSTOMER APP (marketplace) =======================
// Mount: /api/market
//   Bina login: dukaanein dhoondhna (paas ki), dukaan ka page, free slots, reviews
//   Login (Google / Apple): apna naam + mobile, booking, cancel / time badalna, waitlist, review, notifications

const { Shop, Booking, Waitlist, Review, Fabric, UserNotification, User, ACTIVE_BOOKING, PURPOSES } = require('../models');
const { h, ok, created, bad, notFound, conflict, forbidden, requireBody, paging, queryDate, escapeRegex } = require('../utils/http.helpers');
const { nextSeq } = require('../utils/schema.helpers');
const { todayIST, isDateStr } = require('../utils/dates');
const { normalizePhone } = require('../utils/phone');
const online = require('../utils/online');
const bk = require('../utils/bookings');

const liveFilter = { 'online.profile.enabled': true, deletedAt: null, blockedAt: null };

function card(s, extra = {}) {
  const st = online.settingsOf(s);
  const prices = st.profile.services.map((x) => x.fromPaise).filter((n) => n > 0);
  return {
    id: s._id, name: s.name, city: s.city || null, area: st.profile.area || null, logoUrl: s.logoUrl || null,
    photos: st.profile.photos.slice(0, 4), categories: st.profile.categories, homeVisit: st.profile.homeVisit,
    rating: st.rating, verified: !!s.verifiedAt, startingFromPaise: prices.length ? Math.min(...prices) : null,
    location: s.geo && s.geo.coordinates ? { lat: s.geo.coordinates[1], lng: s.geo.coordinates[0] } : null,
    ...extra,
  };
}

// ---------------------------------------------------------------- browse (bina login)
// Query: ?lat=30.37&lng=76.78&radiusKm=15&q=sharma&category=ladies&city=Ambala&freeToday=1&sort=near|rating&limit=20&offset=0
// GET /api/market/shops
const searchShops = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const take = Math.min(limit, 30);
  const f = { ...liveFilter };
  if (req.query.category) f['online.profile.categories'] = String(req.query.category);
  if (req.query.city) f.city = new RegExp('^' + escapeRegex(String(req.query.city).trim()), 'i');
  if (req.query.q) {
    const r = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    f.$or = [{ name: r }, { city: r }, { 'online.profile.area': r }, { 'online.profile.services.name': r }];
  }
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const near = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined;
  let shops;
  if (near) {
    const radius = Math.min(100, Math.max(1, Number(req.query.radiusKm) || 15)) * 1000;
    shops = await Shop.aggregate([
      { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distM', maxDistance: radius, query: f, spherical: true } },
      ...(req.query.sort === 'rating' ? [{ $sort: { 'online.rating.avg': -1, distM: 1 } }] : []),
      { $skip: offset }, { $limit: req.query.freeToday ? 100 : take },
    ]);
  } else {
    shops = await Shop.find(f).sort({ 'online.rating.avg': -1, 'online.rating.count': -1, createdAt: 1 }).skip(offset).limit(req.query.freeToday ? 100 : take).lean();
  }
  const today = todayIST();
  let items = await Promise.all(shops.map(async (s) => card(s, {
    distanceKm: s.distM !== undefined ? Math.round(s.distM / 100) / 10 : null,
    nextFree: await online.nextFree(s, { days: 14 }),
  })));
  if (req.query.freeToday) items = items.filter((x) => x.nextFree && x.nextFree.date === today).slice(0, take);
  ok(res, { items, limit: take, offset });
});

async function liveShop(id) {
  const s = await Shop.findOne({ _id: String(id), ...liveFilter }).lean();
  if (!s) throw notFound('shop_not_found');
  return s;
}

// GET /api/market/shops/:id
const shopPage = h(async (req, res) => {
  const s = await liveShop(req.params.id);
  const st = online.settingsOf(s);
  const { features, adminRules } = await online.featuresFor(s);
  const [reviews, fabrics, next] = await Promise.all([
    Review.find({ shopId: s._id, hiddenAt: null }).sort({ createdAt: -1 }).limit(5).select('-userId').lean(),
    Fabric.find({ shopId: s._id, deletedAt: null, sellPerUnitPaise: { $gt: 0 }, stockQty: { $gt: 0 } }).sort({ name: 1 }).limit(40)
      .select('name fabricType color quality unit sellPerUnitPaise photoUrl stockQty').lean(),
    online.nextFree(s),
  ]);
  ok(res, {
    ...card(s), about: st.profile.about, services: st.profile.services, phone: s.phone || null, whatsappPhone: s.whatsappPhone || s.phone || null,
    address: [s.address, st.profile.area, s.city, s.state, s.pincode].filter(Boolean).join(', '),
    hours: { days: st.hours.days, breaks: st.hours.breaks, slotMinutes: st.hours.slotMinutes, paused: st.hours.paused, earliestDeliveryDays: st.hours.earliestDeliveryDays },
    policy: {
      autoConfirm: !!(st.rules.autoConfirm && features.instantBooking), responseHours: st.rules.responseHours,
      freeCancelHours: st.rules.freeCancelHours, maxReschedules: features.selfService ? st.rules.maxReschedules : 0, selfService: features.selfService,
      advance: features.advance && st.rules.advanceType !== 'none' ? { type: st.rules.advanceType, value: st.rules.advanceType === 'pct' ? Math.min(st.rules.advanceValue, adminRules.maxAdvancePct) : st.rules.advanceValue } : null,
      waitlist: features.waitlist,
    },
    fabrics: fabrics.map((f) => ({ ...f, stockQty: undefined, inStock: true })),
    reviews, nextFree: next,
  });
});

// Query: ?from=2026-11-05&days=14
// GET /api/market/shops/:id/slots
const shopSlots = h(async (req, res) => {
  const s = await liveShop(req.params.id);
  const from = queryDate(req, 'from') || todayIST();
  const days = Math.min(31, Math.max(1, parseInt(req.query.days, 10) || 14));
  ok(res, await online.slotsFor(s, from, days, { forUserId: req.user ? req.user._id : null }));
});

// GET /api/market/shops/:id/reviews
const shopReviews = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const s = await liveShop(req.params.id);
  const f = { shopId: s._id, hiddenAt: null };
  const [items, total] = await Promise.all([Review.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('-userId').lean(), Review.countDocuments(f)]);
  ok(res, { items, total, limit, offset, rating: online.settingsOf(s).rating });
});

// ---------------------------------------------------------------- me
// GET /api/market/me
const getMe = h(async (req, res) => {
  const p = req.user.customerProfile || {};
  ok(res, { name: p.name || req.user.name || null, phone: p.phone || req.user.phone || null, whatsapp: p.whatsapp !== false, city: p.city || null,
    email: req.user.email || null, complete: !!((p.name || req.user.name) && (p.phone || req.user.phone)) });
});

// Body: {"name":"Vishal Kumar","phone":"9876543210","whatsapp":true,"city":"Ambala"}
// PATCH /api/market/me
const patchMe = h(async (req, res) => {
  const b = requireBody(req);
  const set = {};
  if (b.name !== undefined) {
    const n = String(b.name || '').trim().slice(0, 80);
    if (!n) throw bad('name_required');
    set['customerProfile.name'] = n;
  }
  if (b.phone !== undefined) {
    const p = normalizePhone(b.phone);
    if (!p) throw bad('phone_invalid');
    set['customerProfile.phone'] = p;
  }
  if (b.whatsapp !== undefined) set['customerProfile.whatsapp'] = !!b.whatsapp;
  if (b.city !== undefined) set['customerProfile.city'] = String(b.city || '').slice(0, 60);
  if (!Object.keys(set).length) throw bad('no_fields', 'name, phone, whatsapp, city');
  await User.updateOne({ _id: req.user._id }, { $set: set });
  req.user = await User.findById(req.user._id).lean();
  return getMe(req, res);
});

function contactOf(user) {
  const p = user.customerProfile || {};
  const name = p.name || user.name;
  const phone = p.phone || user.phone;
  if (!name || !phone) throw bad('profile_incomplete');
  return { name, phone, whatsapp: p.whatsapp !== false };
}

function cleanItems(items) {
  if (items === undefined) return [];
  if (!Array.isArray(items) || items.length > 10) throw bad('invalid_value', 'items (max 10)');
  return items.map((i) => {
    const garment = String((i && i.garment) || '').trim().slice(0, 60);
    const qty = Number((i && i.qty) || 1);
    if (!garment || !Number.isInteger(qty) || qty < 1 || qty > 50) throw bad('invalid_value', 'items: {garment, qty}');
    return { garment, qty };
  });
}

// ---------------------------------------------------------------- booking
// Body: {"shopId","date":"2026-11-05","time":"12:30","purpose":"measurement","items":[{"garment":"Shirt","qty":2}],
//        "fabric":{"mode":"shop","fabricId":"...","meters":1.6} | {"mode":"own"},"notes":"..."}
// POST /api/market/bookings
const createBooking = h(async (req, res) => {
  const b = requireBody(req);
  const shop = await liveShop(b.shopId);
  const contact = contactOf(req.user);
  if (!isDateStr(b.date) || !online.HHMM.test(String(b.time))) throw bad('invalid_value', 'date, time');
  const purpose = b.purpose || 'measurement';
  if (!PURPOSES.includes(purpose)) throw bad('invalid_value', 'purpose');
  const items = cleanItems(b.items);
  // Ek customer ek dukaan par 3 se zyada chalu booking nahi
  if (await Booking.countDocuments({ shopId: shop._id, userId: req.user._id, status: { $in: ACTIVE_BOOKING } }) >= 3) throw bad('too_many_bookings');
  if (!(await online.slotOpen(shop, b.date, b.time, { forUserId: req.user._id }))) throw conflict('slot_taken');

  const st = online.settingsOf(shop);
  const { tier, features, adminRules } = await online.featuresFor(shop);
  // Kapda dukaan se
  let fabric = { mode: 'own' };
  if (b.fabric && b.fabric.mode === 'shop') {
    const fb = await Fabric.findOne({ _id: String(b.fabric.fabricId || ''), shopId: shop._id, deletedAt: null }).lean();
    const meters = Number(b.fabric.meters);
    if (!fb || !(fb.sellPerUnitPaise > 0)) throw notFound('fabric_not_found');
    if (!(meters > 0 && meters <= 50)) throw bad('invalid_value', 'fabric.meters');
    fabric = { mode: 'shop', fabricId: fb._id, name: fb.name, meters, pricePaise: Math.round(fb.sellPerUnitPaise * meters) };
  }
  const due = features.advance ? online.advanceFor(st.rules, fabric.pricePaise || 0, adminRules) : 0;
  const auto = !!(st.rules.autoConfirm && features.instantBooking);
  const now = new Date();
  // Agar waitlist offer isi slot ka hai to wo "booked"
  const offer = await Waitlist.findOne({ shopId: shop._id, userId: req.user._id, date: b.date, status: 'offered', 'offer.time': b.time, 'offer.expiresAt': { $gt: now } }).lean();

  const doc = await Booking.create({
    shopId: shop._id, userId: req.user._id, number: await nextSeq('booking:' + shop._id), customer: contact,
    date: b.date, time: b.time, startsAt: bk.startsAtOf(b.date, b.time), durationMin: st.hours.slotMinutes, purpose, items, fabric,
    notes: b.notes ? String(b.notes).slice(0, 500) : undefined,
    status: auto ? 'confirmed' : 'pending', autoConfirmed: auto, decidedAt: auto ? now : undefined,
    respondBy: auto ? undefined : new Date(Math.min(now.getTime() + st.rules.responseHours * 3600000, bk.startsAtOf(b.date, b.time).getTime())),
    advance: { duePaise: due, status: due ? 'due' : 'none' },
    commission: await bk.commissionSnapshot(tier),
    history: [{ at: now, by: 'customer', action: auto ? 'booked_confirmed' : 'requested' }],
  });
  // Do log ek saath aakhri jagah le lein: dobara gino, zyada ho to ye wapas
  const [day] = await online.slotsFor(shop, b.date, 1, { forUserId: req.user._id, excludeBookingId: doc._id });
  const slot = day.slots.find((s) => s.time === b.time);
  if (!slot || slot.left < 1) {
    await Booking.deleteOne({ _id: doc._id });
    throw conflict('slot_taken');
  }
  if (offer) await Waitlist.updateOne({ _id: offer._id }, { $set: { status: 'booked', bookingId: doc._id } });
  const x = doc.toObject();
  if (auto) await bk.linkCustomer(shop, x);
  await bk.notifyShop(shop, 'booking_new', auto ? 'notif_bk_auto' : 'notif_bk_new', x);
  created(res, { ...x, shop: { id: shop._id, name: shop.name, upiId: due ? shop.upiId || null : undefined } });
});

// Query: ?scope=active|past
// GET /api/market/bookings
const myBookings = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const active = req.query.scope !== 'past';
  const f = { userId: req.user._id, ...(active ? { status: { $in: ACTIVE_BOOKING } } : { status: { $nin: ACTIVE_BOOKING } }) };
  const [items, total] = await Promise.all([
    Booking.find(f).sort({ startsAt: active ? 1 : -1 }).skip(offset).limit(limit).select('-history -commission').lean(),
    Booking.countDocuments(f),
  ]);
  const shops = await Shop.find({ _id: { $in: [...new Set(items.map((b) => b.shopId))] } }).select('name city logoUrl phone whatsappPhone upiId geo address').lean();
  const byId = new Map(shops.map((s) => [s._id, s]));
  ok(res, { items: items.map((b) => ({ ...b, shop: shopBrief(byId.get(b.shopId)) })), total, limit, offset });
});

function shopBrief(s) {
  if (!s) return null;
  return { id: s._id, name: s.name, city: s.city || null, logoUrl: s.logoUrl || null, phone: s.phone || null, whatsappPhone: s.whatsappPhone || s.phone || null,
    upiId: s.upiId || null, address: s.address || null, location: s.geo && s.geo.coordinates ? { lat: s.geo.coordinates[1], lng: s.geo.coordinates[0] } : null };
}

async function mine(req) {
  const b = await Booking.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!b) throw notFound('booking_not_found');
  return b;
}

// GET /api/market/bookings/:id
const myBooking = h(async (req, res) => {
  const b = await mine(req);
  const shop = await Shop.findById(b.shopId).lean();
  const st = online.settingsOf(shop || {});
  const { features } = shop ? await online.featuresFor(shop) : { features: {} };
  const active = ACTIVE_BOOKING.includes(b.status);
  ok(res, {
    ...b, commission: undefined, shop: shopBrief(shop),
    can: {
      cancel: active && features.selfService !== false,
      freeCancel: active && bk.freeCancel(shop, b),
      reschedule: active && features.selfService && b.reschedules < st.rules.maxReschedules && bk.freeCancel(shop, b),
      review: b.status === 'completed' && !b.reviewId,
      payAdvance: ['due'].includes((b.advance || {}).status) && active,
    },
    policy: { freeCancelHours: st.rules.freeCancelHours, maxReschedules: st.rules.maxReschedules },
  });
});

// Body: {"reason":"..."}
// POST /api/market/bookings/:id/cancel
const cancelMine = h(async (req, res) => {
  const b = await mine(req);
  const shop = await Shop.findById(b.shopId).lean();
  const { features } = await online.featuresFor(shop);
  if (!features.selfService) throw forbidden('call_shop_to_change');
  const free = bk.freeCancel(shop, b);
  const reason = String((req.body && req.body.reason) || '').slice(0, 200);
  const x = await bk.transition(b._id, ACTIVE_BOOKING, { status: 'cancelled', cancelledBy: 'customer', reason, ...bk.advanceAfter(b, free ? 'refund' : 'keep') },
    { by: 'customer', action: free ? 'cancelled' : 'cancelled_late', note: reason });
  if (!x) throw conflict('booking_state', b.status);
  await bk.notifyShop(shop, 'booking_cancelled', 'notif_bk_cancel', x, { reason });
  await bk.offerFreedSlot(shop, x.date, x.time);
  ok(res, { ...x, freeCancel: free });
});

// Body: {"date":"2026-11-07","time":"11:00"}
// POST /api/market/bookings/:id/reschedule
const rescheduleMine = h(async (req, res) => {
  const body = requireBody(req);
  const b = await mine(req);
  const shop = await Shop.findById(b.shopId).lean();
  const { features } = await online.featuresFor(shop);
  const st = online.settingsOf(shop);
  if (!features.selfService) throw forbidden('call_shop_to_change');
  if (!ACTIVE_BOOKING.includes(b.status)) throw conflict('booking_state', b.status);
  if (b.reschedules >= st.rules.maxReschedules) throw bad('reschedule_limit', st.rules.maxReschedules);
  if (!bk.freeCancel(shop, b)) throw bad('reschedule_too_late', st.rules.freeCancelHours);
  if (body.date === b.date && body.time === b.time) throw bad('invalid_value', 'same time');
  if (!(await online.slotOpen(shop, body.date, body.time, { excludeBookingId: b._id, forUserId: req.user._id }))) throw conflict('slot_taken');
  const x = await Booking.findOneAndUpdate({ _id: b._id, status: { $in: ACTIVE_BOOKING }, reschedules: b.reschedules },
    { $set: { date: body.date, time: body.time, startsAt: bk.startsAtOf(body.date, body.time), reminded: { d1: false, h2: false } }, $inc: { reschedules: 1 },
      $push: { history: { at: new Date(), by: 'customer', action: 'rescheduled', note: `${b.date} ${b.time} -> ${body.date} ${body.time}` } } }, { new: true }).lean();
  if (!x) throw conflict('booking_state', b.status);
  await bk.notifyShop(shop, 'booking_rescheduled', 'notif_bk_resched', x);
  await bk.offerFreedSlot(shop, b.date, b.time);
  ok(res, x);
});

// Customer: "maine UPI se advance de diya" (dukaan check karke confirm karegi)
// Body: {"utr":"412345678901"}
// POST /api/market/bookings/:id/advance-paid
const advancePaid = h(async (req, res) => {
  const b = await mine(req);
  const utr = String((req.body && req.body.utr) || '').trim().slice(0, 40) || undefined;
  const x = await Booking.findOneAndUpdate({ _id: b._id, 'advance.status': 'due' },
    { $set: { 'advance.status': 'claimed', 'advance.utr': utr, 'advance.updatedAt': new Date() }, $push: { history: { at: new Date(), by: 'customer', action: 'advance_paid', note: utr } } }, { new: true }).lean();
  if (!x) throw conflict('booking_state', (b.advance || {}).status || 'none');
  const shop = await Shop.findById(b.shopId).lean();
  await bk.notifyShop(shop, 'advance_claimed', 'notif_bk_paid', x);
  ok(res, x);
});

// Body: {"rating":5,"fitting":5,"onTime":4,"value":4,"text":"...","photos":["https://..."]}
// POST /api/market/bookings/:id/review
const reviewMine = h(async (req, res) => {
  const body = requireBody(req);
  const b = await mine(req);
  if (b.status !== 'completed') throw bad('review_after_visit');
  const n = (v, req2) => {
    if (v === undefined || v === null) { if (req2) throw bad('invalid_value', 'rating 1-5'); return undefined; }
    const x = Number(v);
    if (!Number.isInteger(x) || x < 1 || x > 5) throw bad('invalid_value', 'rating 1-5');
    return x;
  };
  const photos = Array.isArray(body.photos) ? body.photos.filter((u) => /^https:\/\//.test(String(u))).slice(0, 4).map(String) : [];
  let r;
  try {
    r = await Review.create({ shopId: b.shopId, userId: req.user._id, bookingId: b._id, userName: contactOf(req.user).name.split(' ')[0],
      rating: n(body.rating, true), fitting: n(body.fitting), onTime: n(body.onTime), value: n(body.value), text: body.text ? String(body.text).slice(0, 1000) : undefined, photos });
  } catch (e) {
    if (e && e.code === 11000) throw conflict('review_exists');
    throw e;
  }
  await Booking.updateOne({ _id: b._id }, { $set: { reviewId: r._id } });
  const rating = await bk.refreshRating(b.shopId);
  const shop = await Shop.findById(b.shopId).lean();
  await bk.notifyShop(shop, 'review_new', 'notif_review_new', { ...b, customer: { name: r.userName } }, { reason: '★'.repeat(r.rating) });
  created(res, { review: r.toObject(), rating });
});

// ---------------------------------------------------------------- waitlist
// Body: {"shopId","date","parts":["morning","evening"],"purpose","items"}
// POST /api/market/waitlist
const joinWaitlist = h(async (req, res) => {
  const b = requireBody(req);
  const shop = await liveShop(b.shopId);
  const { features } = await online.featuresFor(shop);
  if (!features.waitlist) throw forbidden('waitlist_off');
  if (!isDateStr(b.date) || b.date < todayIST()) throw bad('date_format', 'date');
  const parts = Array.isArray(b.parts) && b.parts.length ? b.parts.filter((p) => ['morning', 'afternoon', 'evening'].includes(p)) : ['morning', 'afternoon', 'evening'];
  if (!parts.length) throw bad('invalid_value', 'parts');
  const contact = contactOf(req.user);
  if (await Waitlist.exists({ shopId: shop._id, userId: req.user._id, date: b.date, status: { $in: ['waiting', 'offered'] } })) throw conflict('waitlist_exists');
  const w = await Waitlist.create({ shopId: shop._id, userId: req.user._id, date: b.date, parts, customer: { name: contact.name, phone: contact.phone },
    purpose: PURPOSES.includes(b.purpose) ? b.purpose : 'measurement', items: cleanItems(b.items) });
  const ahead = await Waitlist.countDocuments({ shopId: shop._id, date: b.date, status: { $in: ['waiting', 'offered'] }, createdAt: { $lt: w.createdAt } });
  created(res, { ...w.toObject(), ahead });
});

// GET /api/market/waitlist
const myWaitlist = h(async (req, res) => {
  const items = await Waitlist.find({ userId: req.user._id, status: { $in: ['waiting', 'offered'] }, date: { $gte: todayIST() } }).sort({ date: 1 }).lean();
  const shops = await Shop.find({ _id: { $in: items.map((w) => w.shopId) } }).select('name city logoUrl').lean();
  const byId = new Map(shops.map((s) => [s._id, s]));
  ok(res, items.map((w) => ({ ...w, shop: byId.get(w.shopId) ? { id: w.shopId, name: byId.get(w.shopId).name, city: byId.get(w.shopId).city } : null })));
});

// DELETE /api/market/waitlist/:id
const leaveWaitlist = h(async (req, res) => {
  const w = await Waitlist.findOneAndUpdate({ _id: req.params.id, userId: req.user._id, status: { $in: ['waiting', 'offered'] } }, { $set: { status: 'cancelled' } }).lean();
  if (!w) throw notFound();
  if (w.status === 'offered') {
    const shop = await Shop.findById(w.shopId).lean();
    if (shop) await bk.offerFreedSlot(shop, w.date, w.offer.time);
  }
  ok(res, { id: w._id, cancelled: true });
});

// ---------------------------------------------------------------- notifications
// GET /api/market/notifications
const myNotifications = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const [items, unread] = await Promise.all([
    UserNotification.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    UserNotification.countDocuments({ userId: req.user._id, readAt: null }),
  ]);
  ok(res, { items, unread, limit, offset });
});

// POST /api/market/notifications/read-all
const readAll = h(async (req, res) => {
  const r = await UserNotification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  ok(res, { updated: r.modifiedCount });
});

// Login hai to user, warna aage (browse ke liye)
const optionalAuth = (req, res, next) => (req.get('Authorization') ? require('../middleware').requireAuth(req, res, next) : next());

module.exports = {
  searchShops, shopPage, shopSlots, shopReviews, optionalAuth,
  getMe, patchMe,
  createBooking, myBookings, myBooking, cancelMine, rescheduleMine, advancePaid, reviewMine,
  joinWaitlist, myWaitlist, leaveWaitlist,
  myNotifications, readAll,
};
