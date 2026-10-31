// Admin panel: customer app ki bookings aur reviews (Mount: /api/admin)
const { Booking, Review, Shop, User } = require('../models');
const { h, ok, notFound, paging, queryDate, requireBody, escapeRegex } = require('../utils/http.helpers');
const { addDays, todayIST } = require('../utils/dates');
const bk = require('../utils/bookings');

async function shopNames(ids) {
  const shops = await Shop.find({ _id: { $in: [...new Set(ids)] } }).select('name city').lean();
  return new Map(shops.map((s) => [s._id, s]));
}

// Query: ?status=pending&from=2026-11-01&to=2026-11-30&shopId=&q=
// GET /api/admin/bookings
const listBookings = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = {};
  if (req.query.status) f.status = String(req.query.status);
  if (req.query.shopId) f.shopId = String(req.query.shopId);
  const from = queryDate(req, 'from');
  const to = queryDate(req, 'to');
  if (from || to) f.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (req.query.q) {
    const r = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    const shops = await Shop.find({ name: r }).select('_id').limit(200).lean();
    f.$or = [{ 'customer.name': r }, { 'customer.phone': r }, { shopId: { $in: shops.map((s) => s._id) } }];
  }
  const since30 = addDays(todayIST(), -29);
  const [items, total, byStatus] = await Promise.all([
    Booking.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('-history').lean(),
    Booking.countDocuments(f),
    Booking.aggregate([{ $match: { date: { $gte: since30 } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const names = await shopNames(items.map((b) => b.shopId));
  ok(res, {
    items: items.map((b) => ({ ...b, shopName: (names.get(b.shopId) || {}).name || null, city: (names.get(b.shopId) || {}).city || null })),
    total, limit, offset, last30d: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
  });
});

// Query: ?hidden=1&rating=1&q=
// GET /api/admin/reviews
const listReviews = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = {};
  if (req.query.hidden === '1') f.hiddenAt = { $ne: null };
  if (req.query.hidden === '0') f.hiddenAt = null;
  if (req.query.rating) f.rating = Number(req.query.rating);
  if (req.query.q) {
    const r = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    const shops = await Shop.find({ name: r }).select('_id').limit(200).lean();
    f.$or = [{ text: r }, { userName: r }, { shopId: { $in: shops.map((s) => s._id) } }];
  }
  const [items, total] = await Promise.all([Review.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(), Review.countDocuments(f)]);
  const [names, users] = await Promise.all([
    shopNames(items.map((r) => r.shopId)),
    User.find({ _id: { $in: items.map((r) => r.userId) } }).select('name email customerProfile').lean(),
  ]);
  const byUser = new Map(users.map((u) => [u._id, u]));
  ok(res, {
    items: items.map((r) => {
      const u = byUser.get(r.userId) || {};
      return { ...r, shopName: (names.get(r.shopId) || {}).name || null, user: { name: (u.customerProfile || {}).name || u.name || null, email: u.email || null, phone: (u.customerProfile || {}).phone || null } };
    }),
    total, limit, offset,
  });
});

// Body: {"hidden":true,"reason":"abusive"}
// PATCH /api/admin/reviews/:id
const updateReview = h(async (req, res) => {
  const b = requireBody(req);
  const r = await Review.findByIdAndUpdate(String(req.params.id), b.hidden
    ? { $set: { hiddenAt: new Date(), hiddenReason: String(b.reason || '').slice(0, 200) } }
    : { $set: { hiddenAt: null }, $unset: { hiddenReason: 1 } }, { new: true }).lean();
  if (!r) throw notFound();
  const rating = await bk.refreshRating(r.shopId);
  ok(res, { ...r, shopRating: rating });
});

module.exports = { listBookings, listReviews, updateReview };
