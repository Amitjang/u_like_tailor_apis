// Staff login (mobile + password), permissions, app-config (force update). Server yeh test khud chalata hai:
//   MONGO_URI=mongodb://127.0.0.1:27017/tailor_staff_e2e node tests/staff.e2e.js
// (database KHAALI kar diya jaata hai — asli database ka naam mat dena)
const assert = require('assert/strict');
const path = require('path');
const { spawn } = require('child_process');

const API_PORT = 8082;
const B = `http://127.0.0.1:${API_PORT}/api`;
const ok = (m) => console.log('  ✓', m);

async function req(method, p, body, { tok, shop, expect, lang = 'en' } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Language': lang };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  const j = txt ? JSON.parse(txt) : null;
  if (expect && res.status !== expect) throw new Error(`FAIL ${method} ${p}: ${res.status} ${txt.slice(0, 500)}`);
  return [res.status, j && j.success ? j.data : j];
}

async function waitFor(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tailor_staff_e2e';
  Object.assign(process.env, {
    MONGO_URI: uri, PORT: String(API_PORT), DEV_FIXED_OTP: '123456', RUN_WORKER: 'false', APP_ENV: 'dev',
    ADMIN_PHONES: '9876543210', PAYMENT_PROVIDER: 'none', RAZORPAY_KEY_ID: '', WA_PROVIDER: 'log', OTP_PROVIDER: 'log',
    FIREBASE_SERVICE_ACCOUNT_BASE64: '', PRIVACY_URL: 'https://x.test/privacy', TERMS_URL: 'https://x.test/terms',
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

    console.log('APP CONFIG / FORCE UPDATE');
    let [c, j] = await req('GET', '/public/app-config?platform=android&version=1.0.0', null, { expect: 200 });
    assert.equal(j.updateRequired, false);
    assert.equal(j.privacyUrl, 'https://x.test/privacy');
    assert.equal(j.termsUrl, 'https://x.test/terms');
    // Admin (purana phone login) naya version daalta hai
    await req('POST', '/auth/otp/send', { phone: '9876543210' }, { expect: 200 });
    [c, j] = await req('POST', '/auth/otp/verify', { phone: '9876543210', otp: '123456' }, { expect: 200 });
    const OWNER = j.tokens.accessToken;
    [c] = await req('PUT', '/admin/app-config', { android: { latestVersion: '1.2.0', minVersion: '1.3.0' } }, { tok: OWNER });
    assert.equal(c, 400);
    [c, j] = await req('PUT', '/admin/app-config', { android: { latestVersion: '1.2.0', minVersion: '1.0.0', storeUrl: 'https://play.test/app' },
      forceUpdate: true, message: 'New: staff login', messageHi: 'नया: स्टाफ़ लॉगिन' }, { tok: OWNER, expect: 200 });
    [c, j] = await req('GET', '/public/app-config?platform=android&version=1.0.0', null, { expect: 200, lang: 'hi' });
    assert.equal(j.updateRequired, true);
    assert.equal(j.latestVersion, '1.2.0');
    assert.equal(j.message, 'नया: स्टाफ़ लॉगिन');
    assert.equal(j.storeUrl, 'https://play.test/app');
    [c, j] = await req('GET', '/public/app-config?platform=android&version=1.2.0', null, { expect: 200 });
    assert.equal(j.updateRequired, false);
    [c, j] = await req('GET', '/public/app-config?platform=android&version=1.10.0', null, { expect: 200 });
    assert.equal(j.updateRequired, false);
    [c, j] = await req('GET', '/public/app-config?platform=ios&version=1.0.0', null, { expect: 200 });
    assert.equal(j.updateRequired, false, 'ios not configured -> no force');
    await req('PUT', '/admin/app-config', { forceUpdate: false }, { tok: OWNER, expect: 200 });
    [c, j] = await req('GET', '/public/app-config?platform=android&version=1.0.0', null, { expect: 200 });
    assert.equal(j.updateRequired, false);
    assert.equal(j.updateAvailable, true);
    ok('force update: required when current < latest & force, version compare 1.10 > 1.2, Hindi message');

    console.log('STAFF LOGIN');
    [c, j] = await req('POST', '/shops', { name: 'Sharma Tailors', phone: '9876500000' }, { tok: OWNER, expect: 201 });
    const SHOP = j.id || j.shop.id;
    [c, j] = await req('POST', '/workers', { name: 'Salim', phone: '9812345678', role: 'karigar', payType: 'piece_rate' }, { tok: OWNER, shop: SHOP, expect: 201 });
    const SALIM = j.id;
    [c, j] = await req('GET', `/workers/${SALIM}/access`, null, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.hasAccess, false);
    assert.equal(j.suggestedPhone, '+919812345678');
    [c, j] = await req('PUT', `/workers/${SALIM}/access`, { phone: '9812345678', password: 'salim123' }, { tok: OWNER, shop: SHOP });
    assert.equal(c, 402, 'free plan -> needs Pro');
    const pro = await M.Plan.findOne({ code: 'pro' }).lean();
    await M.Shop.updateOne({ _id: SHOP }, { $set: { subscription: { planId: pro._id, planCode: 'pro', status: 'active', startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 864e5), version: 1 } } });
    [c] = await req('PUT', `/workers/${SALIM}/access`, { phone: '9812345678', password: '123' }, { tok: OWNER, shop: SHOP });
    assert.equal(c, 400);
    [c, j] = await req('PUT', `/workers/${SALIM}/access`, { phone: '9812345678', password: 'salim123', permissions: { payments: true } }, { tok: OWNER, shop: SHOP, expect: 200 });

    assert.equal(j.hasAccess, true);
    assert.equal(j.isActive, true);
    assert.equal(j.loginPhone, '+919812345678');
    assert.equal(j.permissions.payments, true);
    assert.equal(j.permissions.reports, false);
    assert.equal(j.permissions.orders_view, true);
    const MEMBER = j.memberId;
    ok('owner creates staff login (phone prefilled from karigar record), Pro needed, password min 6');

    [c, j] = await req('POST', '/auth/staff-login', { phone: '9812345678', password: 'wrong!!' });
    assert.equal(c, 401);
    [c, j] = await req('POST', '/auth/staff-login', { phone: '9812345678', password: 'salim123' }, { expect: 200 });
    let STAFF = j.tokens.accessToken;
    assert.equal(j.me.shops.length, 1);
    assert.equal(j.me.shops[0].role, 'staff');
    assert.equal(j.me.shops[0].permissions.payments, true);
    assert.equal(j.me.user.passwordHash, undefined);
    ok('staff logs in with mobile + password; sees one shop with permissions');

    console.log('PERMISSIONS');
    [c, j] = await req('GET', '/payments/dues', null, { tok: STAFF, shop: SHOP, expect: 200 });
    [c, j] = await req('GET', '/dashboard/reports/monthly', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    assert.ok(j.message.includes('permission'));
    [c, j] = await req('GET', '/expenses', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    [c, j] = await req('GET', '/dashboard', null, { tok: STAFF, shop: SHOP, expect: 200 });
    assert.equal(j.money, null);
    [c, j] = await req('GET', '/workers', null, { tok: STAFF, shop: SHOP, expect: 200 });
    assert.equal(j.length, 1);
    assert.equal(j[0].payablePaise, undefined, 'no money in limited list');
    [c] = await req('GET', '/workers/attendance', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    [c] = await req('GET', '/shops/team', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    [c] = await req('GET', '/shops/permissions', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    [c] = await req('PUT', `/shops/team/${MEMBER}/permissions`, { permissions: { reports: true } }, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    ok('staff: payments allowed (given), reports/expenses/attendance/team blocked, no money on dashboard');

    [c, j] = await req('GET', '/shops/permissions', null, { tok: OWNER, shop: SHOP, expect: 200, lang: 'hi' });
    assert.ok(j.items.length >= 15);
    assert.equal(j.items.find((x) => x.key === 'payments').label, 'पेमेंट और बाकी');
    [c, j] = await req('PUT', `/shops/team/${MEMBER}/permissions`, { permissions: { reports: true, dashboard_money: true, payments: false, hacker: true } }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.permissions.reports, true);
    assert.equal(j.permissions.payments, false);
    assert.equal(j.permissions.hacker, undefined);
    [c] = await req('GET', '/dashboard/reports/monthly', null, { tok: STAFF, shop: SHOP, expect: 200 });
    [c] = await req('GET', '/payments/dues', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 403);
    [c, j] = await req('GET', '/dashboard', null, { tok: STAFF, shop: SHOP, expect: 200 });
    assert.ok(j.money);
    [c, j] = await req('GET', '/auth/me', null, { tok: STAFF, expect: 200 });
    assert.equal(j.shops[0].permissions.reports, true);
    [c, j] = await req('GET', '/shops/team', null, { tok: OWNER, shop: SHOP, expect: 200 });
    const tm = j.find((m) => m.id === MEMBER);
    assert.equal(tm.loginType, 'password');
    assert.equal(tm.effectivePermissions.reports, true);
    ok('owner changes permissions -> API + /me follow immediately; unknown keys ignored');

    console.log('DISABLE / PASSWORD / DELETE');
    [c, j] = await req('POST', '/auth/change-password', { oldPassword: 'nope', newPassword: 'salim999' }, { tok: STAFF });
    assert.equal(c, 400);
    [c] = await req('POST', '/auth/change-password', { oldPassword: 'salim123', newPassword: 'salim999' }, { tok: STAFF, expect: 200 });
    [c, j] = await req('POST', '/auth/staff-login', { phone: '9812345678', password: 'salim999' }, { expect: 200 });
    STAFF = j.tokens.accessToken;
    ok('staff changes own password');

    [c, j] = await req('PATCH', `/workers/${SALIM}/access`, { isActive: false }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.isActive, false);
    [c] = await req('GET', '/orders', null, { tok: STAFF, shop: SHOP });
    assert.equal(c, 401, 'logged out immediately');
    [c, j] = await req('POST', '/auth/staff-login', { phone: '9812345678', password: 'salim999' });
    assert.equal(c, 403);
    assert.ok(/turned off/.test(j.message));
    await req('PATCH', `/workers/${SALIM}/access`, { isActive: true }, { tok: OWNER, shop: SHOP, expect: 200 });
    [c, j] = await req('POST', '/auth/staff-login', { phone: '9812345678', password: 'salim999' }, { expect: 200 });
    ok('owner turns login off (instant logout, cannot login) and on again');

    // Number badla + password reset
    [c, j] = await req('PUT', `/workers/${SALIM}/access`, { phone: '9800011111', password: 'newpass1' }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.loginPhone, '+919800011111');
    assert.equal(j.permissions.reports, true, 'permissions kept');
    [c] = await req('POST', '/auth/staff-login', { phone: '9812345678', password: 'newpass1' });
    assert.equal(c, 401);
    [c] = await req('POST', '/auth/staff-login', { phone: '9800011111', password: 'newpass1' }, { expect: 200 });
    // Dusre karigar ke liye wahi number nahi
    [c, j] = await req('POST', '/workers', { name: 'Ramesh', phone: '9811100000', role: 'karigar', payType: 'piece_rate' }, { tok: OWNER, shop: SHOP, expect: 201 });
    [c] = await req('PUT', `/workers/${j.id}/access`, { phone: '9800011111', password: 'ramesh12' }, { tok: OWNER, shop: SHOP });
    assert.equal(c, 409);
    ok('owner changes login number + resets password; duplicate login number blocked');

    // Lock after 5 wrong tries
    for (let i = 0; i < 5; i++) await req('POST', '/auth/staff-login', { phone: '9800011111', password: 'bad-pass' });
    [c, j] = await req('POST', '/auth/staff-login', { phone: '9800011111', password: 'newpass1' });
    assert.equal(c, 429);
    await M.User.updateOne({ loginPhone: '+919800011111' }, { $set: { lockedUntil: null } });
    ok('5 wrong passwords -> locked 15 min');

    [c, j] = await req('DELETE', `/workers/${SALIM}/access`, null, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.hasAccess, false);
    assert.equal(await M.User.countDocuments({ loginPhone: '+919800011111' }), 0);
    [c] = await req('POST', '/auth/staff-login', { phone: '9800011111', password: 'newpass1' });
    assert.equal(c, 401);
    [c, j] = await req('GET', `/workers/${SALIM}/access`, null, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.hasAccess, false);
    [c, j] = await req('GET', '/workers', null, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(j.length, 2, 'karigar record stays');
    ok('owner deletes staff login: account gone, karigar record stays');

    { let rc, rj;
    console.log('KAARIGAR ROLE: manager + "other" mein apna likha kaam');
    [rc, rj] = await req('POST', '/workers', { name: 'Raju', role: 'manager', payType: 'monthly', customRole: 'xyz' }, { tok: OWNER, shop: SHOP, expect: 201 });
    assert.equal(rj.role, 'manager'); assert.ok(!rj.customRole);
    [rc, rj] = await req('POST', '/workers', { name: 'Ramu', role: 'other', payType: 'daily' }, { tok: OWNER, shop: SHOP });
    assert.equal(rc, 400); assert.equal(rj.error.key, 'custom_role_required');
    [rc, rj] = await req('POST', '/workers', { name: 'Ramu', role: 'other', customRole: '  Press wala ', payType: 'daily' }, { tok: OWNER, shop: SHOP, expect: 201 });
    const RAMU = rj.id || rj._id;
    assert.equal(rj.customRole, 'Press wala');
    [rc, rj] = await req('PATCH', `/workers/${RAMU}`, { customRole: 'Button wala' }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(rj.customRole, 'Button wala');
    [rc, rj] = await req('PATCH', `/workers/${RAMU}`, { customRole: '' }, { tok: OWNER, shop: SHOP });
    assert.equal(rc, 400);
    [rc, rj] = await req('PATCH', `/workers/${RAMU}`, { role: 'cutter' }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(rj.role, 'cutter'); assert.ok(!rj.customRole);
    [rc, rj] = await req('POST', '/workers', { name: 'Bad', role: 'pilot', payType: 'daily' }, { tok: OWNER, shop: SHOP });
    assert.equal(rc, 400);
    ok('manager role, "other" + likha kaam save/badla, role badalne par customRole hata, galat role mana'); }

    { let rc, rj;
    console.log('PURANE ORDER KI PHOTOS HATAO');
    const old = new Date(Date.now() - 200 * 864e5);
    await M.Order.collection.insertMany([
      { _id: 'ord_old_1', trackingToken: 'tt_old_1', shopId: SHOP, status: 'delivered', deliveredAt: old, items: [{ _id: 'itm_old_1' }], deletedAt: null },
      { _id: 'ord_new_1', trackingToken: 'tt_new_1', shopId: SHOP, status: 'delivered', deliveredAt: new Date(), items: [{ _id: 'itm_new_1' }], deletedAt: null },
      { _id: 'ord_open_1', trackingToken: 'tt_open_1', shopId: SHOP, status: 'stitching', items: [], deletedAt: null, updatedAt: old },
    ]);
    const mk = (entityType, entityId) => ({ shopId: SHOP, entityType, entityId, kind: 'design_reference', url: 'https://example.com/' + entityId + '.jpg', sizeBytes: 1000 });
    await M.Media.create([mk('order', 'ord_old_1'), mk('order_item', 'itm_old_1'), mk('order', 'ord_new_1'), mk('order', 'ord_open_1')]);
    [rc, rj] = await req('POST', '/media/cleanup', { months: 0 }, { tok: OWNER, shop: SHOP });
    assert.equal(rc, 400);
    [rc, rj] = await req('POST', '/media/cleanup', { months: 6, dryRun: true }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(rj.photos, 2); assert.equal(rj.orders, 1); assert.equal(rj.bytes, 2000); assert.equal(rj.deleted, 0);
    assert.equal(await M.Media.countDocuments({ shopId: SHOP, deletedAt: null }), 4);
    [rc, rj] = await req('POST', '/media/cleanup', { months: 6 }, { tok: OWNER, shop: SHOP, expect: 200 });
    assert.equal(rj.deleted, 2);
    assert.equal(await M.Media.countDocuments({ shopId: SHOP, deletedAt: null }), 2); // naya + chalu order bache
    ok('6 mahine purane delivered order ki photos hatin; naye / chalu order ki photos bachin; dryRun sirf ginti'); }
    console.log('\nALL PASSED ✅');
  } finally {
    server.kill();
    await mongoose.disconnect();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
