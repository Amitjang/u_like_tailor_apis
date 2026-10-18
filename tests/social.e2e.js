// Google/Apple login + staff ka phone jodna + Firebase push + deadline reminders (2 din / 1 din / aaj).
// Yeh test khud nakli Google/Apple keys aur nakli Firebase server chalata hai, aur server bhi khud start karta hai:
//   MONGO_URI=mongodb://127.0.0.1:27017/tailor_social_e2e node tests/social.e2e.js
// (database KHAALI kar diya jaata hai — asli database ka naam mat dena)
const assert = require('assert/strict');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');

const FAKE_PORT = 8097;
const API_PORT = 8081;
const B = `http://127.0.0.1:${API_PORT}/api`;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const ok = (m) => console.log('  ✓', m);

// ---------- Nakli Google / Apple / Firebase ----------
const signKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...signKey.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const saKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { project_id: 'demo-tailor', client_email: 'push@demo-tailor.iam.gserviceaccount.com',
  private_key: saKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const PUSHED = [];

const fake = http.createServer((rq, rs) => {
  let raw = '';
  rq.on('data', (c) => { raw += c; });
  rq.on('end', () => {
    const json = (code, b) => { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(b)); };
    if (rq.url === '/google/certs' || rq.url === '/apple/keys') return json(200, { keys: [jwk] });
    if (rq.url === '/token') {
      const assertion = new URLSearchParams(raw).get('assertion');
      try {
        jwt.verify(assertion, saKey.publicKey, { algorithms: ['RS256'] });
        return json(200, { access_token: 'fake-access', expires_in: 3600 });
      } catch (e) {
        return json(400, { error: 'invalid_grant' });
      }
    }
    if (rq.url === `/v1/projects/${SA.project_id}/messages:send`) {
      assert.equal(rq.headers.authorization, 'Bearer fake-access');
      const { message } = JSON.parse(raw);
      if (message.token === 'dead-token') return json(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } });
      PUSHED.push(message);
      return json(200, { name: 'projects/x/messages/1' });
    }
    json(404, {});
  });
});

const idToken = (iss, aud, sub, extra = {}) => jwt.sign({ iss, aud, sub, ...extra }, signKey.privateKey, { algorithm: 'RS256', keyid: 'k1', expiresIn: 600 });
const googleToken = (sub, email, aud = 'google-web-client') => idToken('https://accounts.google.com', aud, sub, { email, email_verified: true, name: 'Owner Sharma' });
const appleToken = (sub, email) => idToken('https://appleid.apple.com', 'com.test.tailor', sub, { email, email_verified: 'true' });

async function req(method, p, body, { tok, shop, expect } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Language': 'en' };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  const j = txt ? JSON.parse(txt) : null;
  if (expect && res.status !== expect) throw new Error(`FAIL ${method} ${p}: ${res.status} ${txt.slice(0, 500)}`);
  return [res.status, j && j.success ? j.data : j];
}

async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tailor_social_e2e';
  Object.assign(process.env, {
    MONGO_URI: uri, PORT: String(API_PORT), DEV_FIXED_OTP: '123456', RUN_WORKER: 'false', APP_ENV: 'dev',
    GOOGLE_CLIENT_IDS: 'google-web-client,google-ios-client', APPLE_CLIENT_IDS: 'com.test.tailor',
    GOOGLE_CERTS_URL: FAKE + '/google/certs', APPLE_KEYS_URL: FAKE + '/apple/keys',
    FIREBASE_SERVICE_ACCOUNT_BASE64: Buffer.from(JSON.stringify(SA)).toString('base64'),
    FCM_BASE_URL: FAKE, GOOGLE_TOKEN_URL: FAKE + '/token', ADMIN_EMAILS: 'owner@example.com',
    PAYMENT_PROVIDER: 'none', RAZORPAY_KEY_ID: '', WA_PROVIDER: 'log', OTP_PROVIDER: 'log',
  });
  await new Promise((r) => fake.listen(FAKE_PORT, r));
  const mongoose = require('mongoose');
  await mongoose.connect(uri);
  await mongoose.connection.db.dropDatabase();

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', (d) => { out += d; });
  server.stderr.on('data', (d) => { out += d; });
  try {
    assert.ok(await waitFor(async () => /Server running/.test(out), 20000), 'server start: ' + out);
    const M = require('../src/models');
    const worker = require('../src/jobs/worker');
    const { todayIST, addDays } = require('../src/utils/dates');

    console.log('GOOGLE / APPLE LOGIN');
    let [c, j] = await req('POST', '/auth/google', { idToken: googleToken('g-owner', 'owner@example.com', 'someone-else') });
    assert.equal(c, 401);
    [c, j] = await req('POST', '/auth/google', { idToken: 'garbage' });
    assert.equal(c, 401);
    ok('wrong audience / garbage token -> 401');

    [c, j] = await req('POST', '/auth/google', { idToken: googleToken('g-owner', 'owner@example.com'), deviceId: 'owner-phone', fcmToken: 'owner-fcm' }, { expect: 200 });
    assert.equal(j.isNewUser, true);
    assert.equal(j.needsPhone, true);
    assert.equal(j.me.user.email, 'owner@example.com');
    assert.equal(j.me.user.name, 'Owner Sharma');
    assert.equal(j.me.user.googleId, undefined, 'googleId hidden');
    const OWNER = j.tokens.accessToken;
    [c, j] = await req('POST', '/auth/google', { idToken: googleToken('g-owner', 'owner@example.com') }, { expect: 200 });
    assert.equal(j.isNewUser, false);
    ok('Google: new user (needsPhone), second login same user');

    [c, j] = await req('GET', '/admin/plans', null, { tok: OWNER });
    assert.notEqual(c, 403);
    ok('ADMIN_EMAILS gives admin access');

    // Owner phone skip karke dukaan banata hai
    [c, j] = await req('POST', '/shops', { name: 'Sharma Tailors', phone: '9876500000', city: 'Jaipur' }, { tok: OWNER, expect: 201 });
    const SHOP = j.id || j.shop.id;
    const pro = await M.Plan.findOne({ code: 'pro' }).lean();
    await M.Shop.updateOne({ _id: SHOP }, { $set: { subscription: { planId: pro._id, planCode: 'pro', status: 'active', startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 864e5), version: 1 } } });
    [c, j] = await req('POST', '/shops/team', { phone: '9811122233', name: 'Ramesh', role: 'staff' }, { tok: OWNER, shop: SHOP, expect: 201 });
    [c, j] = await req('GET', '/shops/team', null, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.find((m) => m.role === 'staff').joined, false);
    ok('owner (no phone) creates shop, adds staff by phone 9811122233');

    console.log('STAFF: APPLE LOGIN + PHONE LINK');
    [c, j] = await req('POST', '/auth/apple', { idToken: appleToken('a-staff', 'xyz@privaterelay.appleid.com'), name: 'Ramesh Kumar', deviceId: 'staff-phone' }, { expect: 200 });
    assert.equal(j.needsPhone, true);
    assert.equal(j.me.shops.length, 0);
    assert.equal(j.me.user.name, 'Ramesh Kumar');
    const STAFF_TMP = j.tokens.accessToken;
    [c, j] = await req('POST', '/auth/phone/send-otp', { phone: '9811122233' }, { tok: STAFF_TMP, expect: 200 });
    assert.equal(j.devOtp, '123456');
    [c, j] = await req('POST', '/auth/phone/verify', { phone: '9811122233', otp: '000000' }, { tok: STAFF_TMP });
    assert.equal(c, 400);
    [c, j] = await req('POST', '/auth/phone/verify', { phone: '9811122233', otp: '123456', deviceId: 'staff-phone', fcmToken: 'staff-fcm' }, { tok: STAFF_TMP, expect: 200 });
    assert.equal(j.merged, true);
    assert.ok(j.tokens && j.tokens.accessToken);
    assert.equal(j.me.shops.length, 1);
    assert.equal(j.me.shops[0].role, 'staff');
    assert.equal(j.me.user.phone, '+919811122233');
    const STAFF = j.tokens.accessToken;
    [c] = await req('GET', '/auth/me', null, { tok: STAFF_TMP });
    assert.equal(c, 401);
    [c, j] = await req('POST', '/auth/apple', { idToken: appleToken('a-staff', 'xyz@privaterelay.appleid.com') }, { expect: 200 });
    assert.equal(j.needsPhone, false);
    assert.equal(j.me.shops[0].role, 'staff');
    assert.equal(await M.User.countDocuments({}), 2);
    [c, j] = await req('GET', '/shops/team', null, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.find((m) => m.role === 'staff').joined, true);
    ok('staff Apple login -> phone OTP -> merged into invited account, sees shop as staff; old token revoked');

    // Owner apna phone jodta hai (kisi aur ka nahi) -> merge nahi
    [c, j] = await req('POST', '/auth/phone/send-otp', { phone: '9876511111' }, { tok: OWNER, expect: 200 });
    [c, j] = await req('POST', '/auth/phone/verify', { phone: '9876511111', otp: '123456' }, { tok: OWNER, expect: 200 });
    assert.equal(j.merged, false);
    assert.equal(j.me.user.hasPhone, true);
    // Staff ka number owner ke account par? (dono ke paas alag Google/Apple) -> 409
    [c, j] = await req('POST', '/auth/phone/send-otp', { phone: '9811122233' }, { tok: OWNER, expect: 200 });
    [c, j] = await req('POST', '/auth/phone/verify', { phone: '9811122233', otp: '123456' }, { tok: OWNER });
    assert.equal(c, 409);
    ok('owner links own phone (no merge); someone else\'s linked number -> 409');

    console.log('PUSH + DEADLINES');
    [c, j] = await req('POST', '/auth/fcm-token', { fcmToken: 'owner-fcm' }, { tok: OWNER, expect: 200 });
    [c, j] = await req('GET', '/services', null, { tok: OWNER, shop: SHOP, expect: 200 });
    const shirt = (j.items || j).find((g) => g.code === 'shirt');
    [c, j] = await req('POST', '/customers', { name: 'Rahul Verma', phone: '9822200000', members: [{ name: 'Rahul Verma', relation: 'self' }] }, { tok: OWNER, shop: SHOP, expect: 201 });
    const cust = j.customer || j;
    const member = cust.members[0].id;
    const today = todayIST();
    const mk = async (date, trialDate) => (await req('POST', '/orders', { customerId: cust.id, promisedDeliveryDate: date, trialDate,
      items: [{ memberId: member, garmentTypeId: shirt.id, ratePaise: 90000 }], advance: { amountPaise: 20000, mode: 'cash' } },
    { tok: OWNER, shop: SHOP, expect: 201 }))[1].order;
    const oToday = await mk(today);
    const o1 = await mk(addDays(today, 1), today);
    const o2 = await mk(addDays(today, 2));
    await mk(addDays(today, 5));

    PUSHED.length = 0;
    const tenAmIST = new Date(`${today}T04:30:00Z`);
    assert.equal(await worker.deadlineReminders(new Date(`${today}T01:00:00Z`)), 0); // 6:30 AM IST: abhi nahi
    const made = await worker.deadlineReminders(tenAmIST);
    assert.equal(made, 4); // aaj, kal, 2 din + aaj trial
    assert.equal(await worker.deadlineReminders(tenAmIST), 0);
    ok('deadline job: today / 1 day / 2 days + trial today, once only, not before 8 AM IST');

    const n = await M.Notification.find({ shopId: SHOP, type: /deadline|trial/ }).lean();
    const byOrder = (o, type) => n.find((x) => x.data.orderId === o.id && x.type === type);
    assert.ok(byOrder(oToday, 'deadline_today').title.startsWith('🔴 Deliver TODAY: #'), byOrder(oToday, 'deadline_today').title);
    assert.ok(byOrder(oToday, 'deadline_today').body.includes('Balance ₹700'));
    assert.ok(byOrder(o1, 'deadline_soon').title.startsWith('⏰ Due tomorrow'));
    assert.ok(byOrder(o2, 'deadline_soon').title.startsWith('⏰ 2 days left'));
    assert.ok(byOrder(o1, 'trial_today').title.startsWith('🧵 Trial TODAY'));
    ok('titles in shop language: ' + byOrder(oToday, 'deadline_today').title + ' | ' + byOrder(oToday, 'deadline_today').body);
    // Hindi dukaan
    await M.Shop.updateOne({ _id: SHOP }, { $set: { defaultLanguage: 'hi' } });
    await M.Order.updateOne({ _id: o2.id }, { $set: { promisedDeliveryDate: today } });
    assert.equal(await worker.deadlineReminders(tenAmIST), 1);
    const hi = await M.Notification.findOne({ 'data.orderId': o2.id, type: 'deadline_today' }).lean();
    assert.ok(hi.title.startsWith('🔴 आज देना है: #3'), hi.title);
    assert.ok(hi.body.includes('ग्राहक आज आएगा') && hi.body.includes('बाकी ₹700'), hi.body);
    ok('Hindi shop + date moved to today -> new notification: ' + hi.title + ' | ' + hi.body);

    assert.ok(await waitFor(() => PUSHED.length >= 10), 'pushes: ' + PUSHED.length);
    const todayPush = PUSHED.filter((m) => m.data.type === 'deadline_today' && m.data.orderId === oToday.id);
    assert.equal(todayPush.length, 2);
    assert.deepEqual(todayPush.map((m) => m.token).sort(), ['owner-fcm', 'staff-fcm']);
    assert.equal(todayPush[0].android.notification.channel_id, 'deadline_today');
    assert.equal(todayPush[0].android.notification.color, '#C62828');
    assert.equal(todayPush[0].data.orderId, oToday.id);
    const soon = PUSHED.find((m) => m.data.type === 'deadline_soon');
    assert.equal(soon.android.notification.channel_id, 'reminders');
    ok('push to owner + staff phones; today = red "deadline_today" channel, others = "reminders"');

    // Paise/plan wali notification staff ko nahi
    PUSHED.length = 0;
    await M.Notification.create({ shopId: SHOP, type: 'low_stock', title: 'Low stock', body: 'x' });
    assert.ok(await waitFor(() => PUSHED.length >= 1));
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(PUSHED.map((m) => m.token), ['owner-fcm']);
    ok('low stock push only to owner/manager');

    // Purana token (app hata di) -> session se hat jaata hai
    await M.Session.updateMany({ fcmToken: 'owner-fcm' }, { $set: { fcmToken: 'dead-token' } });
    await M.Notification.create({ shopId: SHOP, type: 'orders_late', title: 'Late', body: 'x' });
    assert.ok(await waitFor(async () => !(await M.Session.exists({ fcmToken: 'dead-token' }))));
    ok('unregistered token cleaned up');

    [c, j] = await req('POST', '/auth/logout', {}, { tok: STAFF, expect: 200 });
    assert.equal(await M.Session.countDocuments({ fcmToken: 'staff-fcm' }), 0);
    ok('logout removes push token');

    console.log('\nALL PASSED ✅');
  } finally {
    server.kill();
    fake.close();
    await mongoose.disconnect();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
