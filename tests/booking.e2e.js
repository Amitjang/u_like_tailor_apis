// Online booking: dukaan ki settings, free slots, customer booking, accept / decline / expire, waitlist, advance, review, admin.
//   MONGO_URI=mongodb://127.0.0.1:27017/tailor_booking_e2e node tests/booking.e2e.js
// (database KHAALI kar diya jaata hai — asli database ka naam mat dena)
const assert = require('assert/strict');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const API_PORT = 8084;
const B = `http://127.0.0.1:${API_PORT}/api`;
const ok = (m) => console.log('  ✓', m);

async function req(method, p, body, { tok, shop, expect, lang = 'en' } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Language': lang };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (expect && res.status !== expect) throw new Error(`FAIL ${method} ${p}: ${res.status} ${txt.slice(0, 600)}`);
  const j = txt ? JSON.parse(txt) : null;
  return [res.status, j && j.success ? j.data : j];
}
const waitFor = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tailor_booking_e2e';
  Object.assign(process.env, {
    MONGO_URI: uri, PORT: String(API_PORT), DEV_FIXED_OTP: '123456', RUN_WORKER: 'false', APP_ENV: 'dev',
    ADMIN_EMAILS: 'boss@example.com', ADMIN_PHONES: '', PAYMENT_PROVIDER: 'none', RAZORPAY_KEY_ID: '', WA_PROVIDER: 'log', OTP_PROVIDER: 'log', FIREBASE_SERVICE_ACCOUNT_BASE64: '',
  });
  const mongoose = require('mongoose');
  await mongoose.connect(uri);
  await mongoose.connection.db.dropDatabase();
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', (d) => { out += d; });
  server.stderr.on('data', (d) => { out += d; });
  try {
    assert.ok(await waitFor(async () => /Server running/.test(out)), 'server: ' + out);
    const M = require('../src/models');
    const cfg = require('../src/config/env').load();
    const { signAccess, sha256 } = require('../src/utils/auth');
    const { todayIST, addDays, istDateTime } = require('../src/utils/dates');
    const { bookingJobs } = require('../src/utils/bookings');

    async function googleUser(email, name) {
      const u = await M.User.create({ email, name, googleId: 'g-' + email, isActive: true });
      const s = await M.Session.create({ userId: u._id, refreshTokenHash: sha256(crypto.randomUUID()), expiresAt: new Date(Date.now() + 86400000) });
      return { id: u._id, tok: signAccess(cfg.jwtSecret, u._id, s._id, 3600).token };
    }
    const OWNER = await googleUser('owner@example.com', 'Ramesh');
    const BOSS = await googleUser('boss@example.com', 'Boss');
    const C1 = await googleUser('c1@example.com', 'Vishal Kumar');
    const C2 = await googleUser('c2@example.com', 'Neha Sharma');
    const C3 = await googleUser('c3@example.com', 'Pooja');
    let [c, j] = await req('POST', '/shops', { name: 'Sharma Tailors', phone: '9811111111', city: 'Ambala' }, { tok: OWNER.tok, expect: 201 });
    const SHOP = j.id || j.shop.id;
    const o = { tok: OWNER.tok, shop: SHOP };
    const T1 = addDays(todayIST(), 1); // kal
    const T2 = addDays(todayIST(), 2);

    console.log('SHOP SETTINGS');
    [c, j] = await req('GET', '/online/settings', null, { ...o, expect: 200 });
    assert.equal(j.profile.enabled, false);
    assert.deepEqual(j.missing.sort(), ['categories', 'location', 'photos']);
    assert.equal(j.features.waitlist, true);
    [c, j] = await req('PUT', '/online/profile', { enabled: true }, o);
    assert.equal(c, 400);
    assert.equal(j.error.key, 'online_incomplete');
    [c] = await req('PUT', '/online/profile', { location: { lat: 51.5, lng: -0.1 } }, o);
    assert.equal(c, 400, 'outside India');
    [c, j] = await req('PUT', '/online/profile', { enabled: true, about: 'Gents specialist since 1998', categories: ['gents', 'alteration'], area: 'Model Town',
      services: [{ name: 'Shirt', fromPaise: 45000 }, { name: 'Suit', fromPaise: 350000 }], location: { lat: 30.3782, lng: 76.7767 } }, { ...o, expect: 200 });
    assert.equal(j.profile.enabled, true);
    assert.deepEqual(j.location, { lat: 30.3782, lng: 76.7767 });
    const allOpen = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: true, from: '10:00', to: '19:00' }]));
    [c, j] = await req('PUT', '/online/hours', { days: allOpen, breaks: [], slotMinutes: 60, perSlot: 1, minLeadMinutes: 0 }, { ...o, expect: 200 });
    assert.equal(j.hours.slotMinutes, 60);
    [c] = await req('PUT', '/online/hours', { slotMinutes: 20 }, o);
    assert.equal(c, 400);
    [c] = await req('PUT', '/online/hours', { days: { 1: { open: true, from: '19:00', to: '10:00' } } }, o);
    assert.equal(c, 400, 'to before from');
    [c] = await req('PUT', '/online/rules', { freeCancelHours: 1 }, o);
    assert.equal(c, 400, 'below admin minimum 2h');
    [c] = await req('PUT', '/online/rules', { advanceType: 'pct', advanceValue: 30 }, o);
    assert.equal(c, 400, 'above admin max 25%');
    [c, j] = await req('PUT', '/online/rules', { autoConfirm: false, freeCancelHours: 2, advanceType: 'pct', advanceValue: 20 }, { ...o, expect: 200 });
    assert.equal(j.rules.advanceValue, 20);
    ok('profile needs location + category to go online; hours / rules validated against admin limits');

    console.log('CUSTOMER BROWSE');
    [c, j] = await req('GET', '/market/shops?lat=30.38&lng=76.78&radiusKm=5', null, { expect: 200 });
    assert.equal(j.items.length, 1);
    assert.equal(j.items[0].name, 'Sharma Tailors');
    assert.ok(j.items[0].distanceKm < 1);
    assert.equal(j.items[0].startingFromPaise, 45000);
    assert.ok(j.items[0].nextFree, 'next free slot shown');
    [c, j] = await req('GET', '/market/shops?lat=28.61&lng=77.21&radiusKm=10', null, { expect: 200 });
    assert.equal(j.items.length, 0, 'Delhi is far');
    [c, j] = await req('GET', '/market/shops?category=ladies', null, { expect: 200 });
    assert.equal(j.items.length, 0);
    [c, j] = await req('GET', '/market/shops?q=shirt', null, { expect: 200 });
    assert.equal(j.items.length, 1, 'search by service');
    [c, j] = await req('GET', `/market/shops/${SHOP}`, null, { expect: 200 });
    assert.equal(j.policy.autoConfirm, false);
    assert.equal(j.policy.freeCancelHours, 2);
    assert.deepEqual(j.policy.advance, { type: 'pct', value: 20 });
    [c, j] = await req('GET', `/market/shops/${SHOP}/slots?from=${T1}&days=2`, null, { expect: 200 });
    assert.equal(j[0].slots.length, 9, '10:00..18:00 hourly');
    assert.equal(j[0].status, 'free');
    ok('nearby search (geo), category / service search, shop page with policy, slots');

    console.log('BOOK -> ACCEPT');
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T1, time: '11:00' }, { tok: C1.tok });
    assert.equal(c, 400);
    assert.equal(j.error.key, 'profile_incomplete');
    [c] = await req('PATCH', '/market/me', { name: 'Vishal Kumar', phone: '12' }, { tok: C1.tok });
    assert.equal(c, 400);
    for (const [cu, ph] of [[C1, '9876543210'], [C2, '9876500002'], [C3, '9876500003']]) await req('PATCH', '/market/me', { phone: ph }, { tok: cu.tok, expect: 200 });
    [c, j] = await req('GET', '/market/me', null, { tok: C1.tok, expect: 200 });
    assert.equal(j.complete, true);
    assert.equal(j.name, 'Vishal Kumar', 'name from Google');
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T1, time: '11:00', items: [{ garment: 'Shirt', qty: 2 }], notes: 'Slim fit' }, { tok: C1.tok, expect: 201 });
    const BK1 = j.id;
    assert.equal(j.status, 'pending');
    assert.ok(j.respondBy);
    assert.equal(j.number, 1);
    assert.equal(j.commission.enabled, false);
    assert.equal(await M.Notification.countDocuments({ shopId: SHOP, type: 'booking_new' }), 1);
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T1, time: '11:00' }, { tok: C2.tok });
    assert.equal(c, 409, 'perSlot 1 -> taken');
    [c] = await req('POST', '/market/bookings', { shopId: SHOP, date: todayIST(), time: '00:00' }, { tok: C2.tok });
    assert.equal(c, 409, 'not a slot');
    [c, j] = await req('GET', '/online/bookings?view=pending', null, { ...o, expect: 200 });
    assert.equal(j.items.length, 1);
    assert.equal(j.counts.pending, 1);
    await req('POST', `/online/bookings/${BK1}/accept`, {}, { ...o, expect: 200 });
    [c] = await req('POST', `/online/bookings/${BK1}/accept`, {}, o);
    assert.equal(c, 409, 'already confirmed');
    const cust = await M.Customer.findOne({ shopId: SHOP, phone: '+919876543210' }).lean();
    assert.ok(cust && cust.source === 'u_like_tailor_app', 'added to shop customers');
    assert.equal(await M.UserNotification.countDocuments({ userId: C1.id, type: 'booking_confirmed' }), 1);
    [c, j] = await req('GET', `/online/calendar?date=${T1}`, null, { ...o, expect: 200 });
    const s11 = j[0].slots.find((s) => s.time === '11:00');
    assert.equal(s11.booked[0].customer.name, 'Vishal Kumar');
    assert.equal(s11.left, 0);
    ok('profile required, book (pending), double booking blocked, shop accepts, customer added to shop list + notified');

    console.log('BLOCK / WAITLIST / RESCHEDULE');
    [c, j] = await req('POST', '/online/blocks', { date: T1, time: '12:00', note: 'walk-in' }, { ...o, expect: 201 });
    const BLK = j.id;
    [c] = await req('POST', '/online/blocks', { date: T1, time: '12:00' }, o);
    assert.equal(c, 409);
    [c, j] = await req('GET', `/market/shops/${SHOP}/slots?from=${T1}&days=1`, null, { expect: 200 });
    assert.equal(j[0].slots.find((s) => s.time === '12:00').left, 0);
    await req('DELETE', `/online/blocks/${BLK}`, null, { ...o, expect: 200 });
    [c, j] = await req('POST', '/market/waitlist', { shopId: SHOP, date: T1, parts: ['morning'] }, { tok: C2.tok, expect: 201 });
    const W2 = j.id;
    assert.equal(j.ahead, 0);
    [c] = await req('POST', '/market/waitlist', { shopId: SHOP, date: T1 }, { tok: C2.tok });
    assert.equal(c, 409);
    // C1 11:00 -> 13:00: 11:00 khaali -> C2 ko offer
    [c, j] = await req('POST', `/market/bookings/${BK1}/reschedule`, { date: T1, time: '13:00' }, { tok: C1.tok, expect: 200 });
    assert.equal(j.reschedules, 1);
    assert.equal(j.time, '13:00');
    let w = await M.Waitlist.findById(W2).lean();
    assert.equal(w.status, 'offered');
    assert.equal(w.offer.time, '11:00');
    assert.equal(await M.UserNotification.countDocuments({ userId: C2.id, type: 'waitlist_offer' }), 1);
    [c] = await req('POST', '/market/bookings', { shopId: SHOP, date: T1, time: '11:00' }, { tok: C3.tok });
    assert.equal(c, 409, 'held for waitlist person');
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T1, time: '11:00' }, { tok: C2.tok, expect: 201 });
    const BK2 = j.id;
    await req('POST', `/online/bookings/${BK2}/accept`, {}, { ...o, expect: 200 });
    w = await M.Waitlist.findById(W2).lean();
    assert.equal(w.status, 'booked');
    assert.equal(w.bookingId, BK2);
    assert.equal(await M.Notification.countDocuments({ shopId: SHOP, type: 'booking_rescheduled' }), 1);
    ok('block / unblock slot, waitlist, reschedule frees slot -> offered to waitlist (held), waitlist person books it');

    console.log('AUTO-CONFIRM + ADVANCE');
    await req('PUT', '/online/rules', { autoConfirm: true }, { ...o, expect: 200 });
    const fab = await M.Fabric.create({ shopId: SHOP, name: 'Giza Cotton', sellPerUnitPaise: 25000, stockQty: 40 });
    [c, j] = await req('GET', `/market/shops/${SHOP}`, null, { expect: 200 });
    assert.equal(j.fabrics.length, 1);
    assert.equal(j.policy.autoConfirm, true);
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T1, time: '15:00', fabric: { mode: 'shop', fabricId: fab._id, meters: 2 } }, { tok: C3.tok, expect: 201 });
    const BK3 = j.id;
    assert.equal(j.status, 'confirmed');
    assert.equal(j.autoConfirmed, true);
    assert.equal(j.fabric.pricePaise, 50000);
    assert.deepEqual([j.advance.duePaise, j.advance.status], [10000, 'due'], '20% of fabric');
    [c, j] = await req('GET', `/market/bookings/${BK3}`, null, { tok: C3.tok, expect: 200 });
    assert.equal(j.can.payAdvance, true);
    assert.equal(j.can.freeCancel, true);
    await req('POST', `/market/bookings/${BK3}/advance-paid`, { utr: '412345678901' }, { tok: C3.tok, expect: 200 });
    assert.equal(await M.Notification.countDocuments({ shopId: SHOP, type: 'advance_claimed' }), 1);
    [c, j] = await req('POST', `/online/bookings/${BK3}/advance-received`, {}, { ...o, expect: 200 });
    assert.equal(j.advance.status, 'received');
    // free window ke andar cancel -> advance wapas karna
    [c, j] = await req('POST', `/market/bookings/${BK3}/cancel`, { reason: 'plans changed' }, { tok: C3.tok, expect: 200 });
    assert.equal(j.freeCancel, true);
    assert.equal(j.advance.status, 'refund_due');
    [c, j] = await req('POST', `/online/bookings/${BK3}/advance-refunded`, {}, { ...o, expect: 200 });
    assert.equal(j.advance.status, 'refunded');
    ok('auto-confirm, shop fabric with 20% advance, UPI paid -> received, free cancel -> refund due -> refunded');

    console.log('DECLINE / EXPIRE / REMINDERS');
    await req('PUT', '/online/rules', { autoConfirm: false }, { ...o, expect: 200 });
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T2, time: '17:00' }, { tok: C3.tok, expect: 201 });
    const BK4 = j.id;
    [c, j] = await req('POST', `/online/bookings/${BK4}/decline`, { reason: 'Closed early' }, { ...o, expect: 200 });
    assert.equal(j.status, 'declined');
    assert.equal(await M.UserNotification.countDocuments({ userId: C3.id, type: 'booking_declined' }), 1);
    [c, j] = await req('POST', '/market/bookings', { shopId: SHOP, date: T2, time: '18:00' }, { tok: C3.tok, expect: 201 });
    const BK5 = j.id;
    await M.Booking.updateOne({ _id: BK5 }, { $set: { respondBy: new Date(Date.now() - 1000) } });
    let r = await bookingJobs(new Date());
    assert.equal(r.expired, 1);
    assert.equal((await M.Booking.findById(BK5).lean()).status, 'expired');
    // C1 ki booking T1 13:00: 3 ghante pehle = 1 din wala, 1 ghanta pehle = 2 ghante wala
    const st = istDateTime(T1, '13:00');
    r = await bookingJobs(new Date(st.getTime() - 3 * 3600000));
    assert.ok(r.reminders >= 1);
    r = await bookingJobs(new Date(st.getTime() - 3600000));
    assert.ok(r.reminders >= 1);
    const rem = await M.UserNotification.find({ userId: C1.id, type: 'booking_reminder' }).lean();
    assert.equal(rem.length, 2);
    r = await bookingJobs(new Date(st.getTime() - 1800000));
    assert.equal(await M.UserNotification.countDocuments({ userId: C1.id, type: 'booking_reminder' }), 2, 'not sent twice');
    // waitlist offer ka time khatam
    const W3 = await M.Waitlist.create({ shopId: SHOP, userId: C3.id, date: T2, status: 'offered', offer: { time: '10:00', expiresAt: new Date(Date.now() - 1000) } });
    r = await bookingJobs(new Date());
    assert.equal(r.offersExpired, 1);
    assert.equal((await M.Waitlist.findById(W3._id).lean()).status, 'expired');
    ok('decline (customer told), no reply -> expired, reminders 1 day + 2 hours (once), waitlist offer expiry');

    console.log('VISIT -> REVIEW');
    [c] = await req('POST', `/online/bookings/${BK1}/no-show`, {}, o);
    assert.equal(c, 400, 'time not come yet');
    [c] = await req('POST', `/market/bookings/${BK1}/review`, { rating: 5 }, { tok: C1.tok });
    assert.equal(c, 400, 'review only after visit');
    await req('POST', `/online/bookings/${BK1}/complete`, {}, { ...o, expect: 200 });
    [c, j] = await req('GET', `/market/bookings/${BK1}`, null, { tok: C1.tok, expect: 200 });
    assert.equal(j.can.review, true);
    [c] = await req('POST', `/market/bookings/${BK1}/review`, { rating: 7 }, { tok: C1.tok });
    assert.equal(c, 400);
    [c, j] = await req('POST', `/market/bookings/${BK1}/review`, { rating: 4, fitting: 5, onTime: 3, text: 'Perfect fitting, 1 day late' }, { tok: C1.tok, expect: 201 });
    const REV = j.review.id;
    assert.deepEqual(j.rating, { avg: 4, count: 1 });
    [c] = await req('POST', `/market/bookings/${BK1}/review`, { rating: 5 }, { tok: C1.tok });
    assert.equal(c, 409);
    await req('POST', `/online/reviews/${REV}/reply`, { text: 'Thank you Vishal ji!' }, { ...o, expect: 200 });
    [c, j] = await req('GET', `/market/shops/${SHOP}/reviews`, null, { expect: 200 });
    assert.equal(j.items[0].reply.text, 'Thank you Vishal ji!');
    assert.equal(j.items[0].userName, 'Vishal');
    assert.equal(j.items[0].userId, undefined, 'user id hidden in public');
    [c, j] = await req('GET', '/market/shops?lat=30.38&lng=76.78', null, { expect: 200 });
    assert.equal(j.items[0].rating.avg, 4);
    ok('complete -> review once (1-5), rating on shop card, shop reply public');

    console.log('ADMIN');
    [c, j] = await req('GET', '/admin/bookings', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 5);
    assert.equal(j.items[0].shopName, 'Sharma Tailors');
    [c, j] = await req('GET', '/admin/bookings?status=expired', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 1);
    [c, j] = await req('PATCH', `/admin/reviews/${REV}`, { hidden: true, reason: 'test' }, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.shopRating.count, 0);
    [c, j] = await req('GET', `/market/shops/${SHOP}/reviews`, null, { expect: 200 });
    assert.equal(j.items.length, 0, 'hidden review not public');
    [c, j] = await req('GET', '/admin/reviews?hidden=1', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.items[0].user.phone, '+919876543210');
    [c, j] = await req('GET', '/admin/dashboard', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.bookings.onlineShops, 1);
    // Admin ne self-service band kiya -> customer khud cancel nahi kar sakta
    await req('PUT', '/admin/marketplace-settings', { features: { selfService: { enabled: false } } }, { tok: BOSS.tok, expect: 200 });
    [c, j] = await req('POST', `/market/bookings/${BK2}/cancel`, {}, { tok: C2.tok });
    assert.equal(c, 403);
    assert.equal(j.error.key, 'call_shop_to_change');
    await req('PUT', '/admin/marketplace-settings', { features: { selfService: { enabled: true } } }, { tok: BOSS.tok, expect: 200 });
    // Dukaan block -> customer app se gayab
    await req('PATCH', `/admin/shops/${SHOP}`, { blocked: true }, { tok: BOSS.tok, expect: 200 });
    [c] = await req('GET', `/market/shops/${SHOP}`, null);
    assert.equal(c, 404);
    await req('PATCH', `/admin/shops/${SHOP}`, { blocked: false }, { tok: BOSS.tok, expect: 200 });
    ok('admin bookings + filter, hide review (rating recalculated), dashboard count, self-service switch, blocked shop hidden');

    console.log('CUSTOMER LISTS');
    [c, j] = await req('GET', '/market/bookings?scope=past', null, { tok: C3.tok, expect: 200 });
    assert.deepEqual(j.items.map((b) => b.status).sort(), ['cancelled', 'declined', 'expired']);
    assert.equal(j.items[0].shop.name, 'Sharma Tailors');
    [c, j] = await req('GET', '/market/notifications', null, { tok: C1.tok, expect: 200 });
    assert.ok(j.unread >= 3);
    await req('POST', '/market/notifications/read-all', {}, { tok: C1.tok, expect: 200 });
    [c, j] = await req('GET', '/market/notifications', null, { tok: C1.tok, expect: 200 });
    assert.equal(j.unread, 0);
    [c, j] = await req('GET', '/online/month?days=7', null, { ...o, expect: 200 });
    assert.equal(j.length, 7);
    [c, j] = await req('GET', '/online/bookings?view=past', null, { ...o, expect: 200 });
    assert.ok(j.total >= 3);
    ok('customer past bookings with shop, notifications read, shop month view');

    await sleep(200);
    console.log('\nALL BOOKING TESTS PASSED');
  } catch (e) {
    console.error(out.split('\n').filter((l) => /ERROR/.test(l)).slice(-3).join('\n'));
    throw e;
  } finally {
    server.kill();
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
