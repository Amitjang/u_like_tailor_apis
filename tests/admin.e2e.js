// Admin Panel APIs. Server yeh test khud chalata hai:
//   MONGO_URI=mongodb://127.0.0.1:27017/tailor_admin_e2e node tests/admin.e2e.js
// (database KHAALI kar diya jaata hai — asli database ka naam mat dena)
const assert = require('assert/strict');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const API_PORT = 8083;
const B = `http://127.0.0.1:${API_PORT}/api`;
const ok = (m) => console.log('  ✓', m);

async function req(method, p, body, { tok, shop, expect, lang = 'en', raw } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Language': lang };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (expect && res.status !== expect) throw new Error(`FAIL ${method} ${p}: ${res.status} ${txt.slice(0, 500)}`);
  if (raw) return [res.status, txt, res];
  const j = txt ? JSON.parse(txt) : null;
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
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tailor_admin_e2e';
  Object.assign(process.env, {
    MONGO_URI: uri, PORT: String(API_PORT), DEV_FIXED_OTP: '123456', RUN_WORKER: 'false', APP_ENV: 'dev',
    ADMIN_PHONES: '9876543210', ADMIN_EMAILS: 'boss@example.com', PAYMENT_PROVIDER: 'none', RAZORPAY_KEY_ID: '', WA_PROVIDER: 'log', OTP_PROVIDER: 'log',
    FIREBASE_SERVICE_ACCOUNT_BASE64: '',
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

    // Google user (email) ke liye seedha session — asli Google token ki zaroorat nahi
    async function emailLogin(email, name) {
      const u = await M.User.create({ email, name, googleId: 'g-' + email, isActive: true });
      const s = await M.Session.create({ userId: u._id, refreshTokenHash: sha256(crypto.randomUUID()), expiresAt: new Date(Date.now() + 86400000) });
      return { id: u._id, tok: signAccess(cfg.jwtSecret, u._id, s._id, 3600).token };
    }
    async function phoneLogin(phone) {
      await req('POST', '/auth/otp/send', { phone }, { expect: 200 });
      const [, j] = await req('POST', '/auth/otp/verify', { phone, otp: '123456' }, { expect: 200 });
      return { id: j.me.id || j.me.user && j.me.user.id, tok: j.tokens.accessToken };
    }

    console.log('ACCESS');
    const BOSS = await emailLogin('boss@example.com', 'Boss');
    const PHONE_ADMIN = await phoneLogin('9876543210');
    const TAILOR = await phoneLogin('9811111111');
    let [c, j] = await req('GET', '/admin/me', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.role, 'owner');
    assert.equal(j.source, 'env');
    [c, j] = await req('GET', '/admin/me', null, { tok: PHONE_ADMIN.tok, expect: 200 });
    assert.equal(j.role, 'owner');
    [c] = await req('GET', '/admin/dashboard', null, { tok: TAILOR.tok });
    assert.equal(c, 403);
    [c] = await req('GET', '/admin/dashboard');
    assert.equal(c, 401);
    ok('env email + env phone admins pass, normal user 403, no login 401');

    console.log('SHOPS');
    [c, j] = await req('POST', '/shops', { name: 'Sharma Tailors', phone: '9811111111', city: 'Ambala' }, { tok: TAILOR.tok, expect: 201 });
    const SHOP = j.id || j.shop.id;
    const T2 = await phoneLogin('9822222222');
    [c, j] = await req('POST', '/shops', { name: 'Riya Boutique', city: 'Panchkula' }, { tok: T2.tok, expect: 201 });
    const SHOP2 = j.id || j.shop.id;
    await req('POST', '/customers', { name: 'Vishal', phone: '9833333333' }, { tok: TAILOR.tok, shop: SHOP, expect: 201 });

    [c, j] = await req('GET', '/admin/shops', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 2);
    const row = j.items.find((s) => s.id === SHOP);
    assert.equal(row.customers, 1);
    assert.equal(row.plan.tier, 'free');
    assert.equal(row.owner.phone, '+919811111111');
    [c, j] = await req('GET', '/admin/shops?q=riya', null, { tok: BOSS.tok, expect: 200 });
    assert.deepEqual(j.items.map((s) => s.id), [SHOP2]);
    [c, j] = await req('GET', '/admin/shops?q=9811111111', null, { tok: BOSS.tok, expect: 200 });
    assert.deepEqual(j.items.map((s) => s.id), [SHOP], 'search by owner phone');
    [c, j] = await req('GET', '/admin/shops?city=ambala', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 1);
    [c, j] = await req('GET', `/admin/shops/${SHOP}`, null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.shop.name, 'Sharma Tailors');
    assert.equal(j.usage.customers.used, 1);
    assert.equal(j.usage.customers.max, 100);
    assert.equal(j.members.length, 1);
    ok('list, search (name / owner phone / city), detail with usage');

    // Plan dena -> extend -> cancel
    [c, j] = await req('POST', `/admin/shops/${SHOP}/subscription/extend`, { days: 30 }, { tok: BOSS.tok });
    assert.equal(c, 400, 'free shop cannot be extended');
    await req('POST', `/admin/shops/${SHOP}/subscription/grant`, { planCode: 'pro', amountPaise: 29900, method: 'cash', note: 'paid at shop' }, { tok: BOSS.tok, expect: 201 });
    [c, j] = await req('GET', `/admin/shops/${SHOP}`, null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.plan.tier, 'pro');
    const end1 = new Date(j.plan.endsAt);
    [c, j] = await req('POST', `/admin/shops/${SHOP}/subscription/extend`, { days: 10 }, { tok: BOSS.tok, expect: 200 });
    assert.equal(Math.round((new Date(j.plan.endsAt) - end1) / 86400000), 10);
    [c] = await req('POST', `/admin/shops/${SHOP}/subscription/extend`, { days: 0 }, { tok: BOSS.tok });
    assert.equal(c, 400);
    [c, j] = await req('GET', '/admin/shops?tier=pro', null, { tok: BOSS.tok, expect: 200 });
    assert.deepEqual(j.items.map((s) => s.id), [SHOP]);
    ok('grant pro, extend +10 days, tier filter');

    // Dashboard
    [c, j] = await req('GET', '/admin/dashboard', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.shops.total, 2);
    assert.equal(j.shops.paid, 1);
    assert.equal(j.revenue.thisMonthPaise, 29900);
    assert.equal(j.revenue.mrrPaise, 29900);
    assert.equal(j.planMix.pro, 1);
    assert.equal(j.planMix.free, 1);
    assert.equal(j.signups30d.length, 30);
    assert.equal(j.signups30d[29].shops, 2);
    assert.equal(j.revenue6m.length, 6);
    assert.equal(j.revenue6m[5].paise, 29900);
    assert.equal(j.recentPayments[0].shopName, 'Sharma Tailors');
    ok('dashboard: totals, MRR, plan mix, 30-day signups, 6-month revenue');

    // Payments + CSV + refund
    [c, j] = await req('GET', '/admin/subscription-payments?q=sharma', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.items.length, 1);
    assert.equal(j.summary.revenuePaise, 29900);
    assert.equal(j.summary.gstPaise, 29900 - Math.round(29900 / 1.18));
    const PAY = j.items[0].id;
    let txt;
    [c, txt] = await req('GET', '/admin/subscription-payments.csv', null, { tok: BOSS.tok, expect: 200, raw: true });
    assert.match(txt, /receipt,shop,city,plan/);
    assert.match(txt, /Sharma Tailors,Ambala,pro,299\.00/);
    [c, j] = await req('POST', `/admin/subscription-payments/${PAY}/mark-refunded`, { note: 'refunded on razorpay' }, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.status, 'refunded');
    [c] = await req('POST', `/admin/subscription-payments/${PAY}/mark-refunded`, {}, { tok: BOSS.tok });
    assert.equal(c, 400, 'only paid -> refunded');
    [c, j] = await req('POST', `/admin/shops/${SHOP}/subscription/cancel`, {}, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.plan.tier, 'free');
    ok('payments search, GST, CSV export, mark refunded, cancel to Free');

    // Block shop -> app band
    await req('GET', '/shops/current', null, { tok: TAILOR.tok, shop: SHOP, expect: 200 });
    [c, j] = await req('PATCH', `/admin/shops/${SHOP}`, { blocked: true, blockedReason: 'fake', verified: true, adminNote: 'called owner' }, { tok: BOSS.tok, expect: 200 });
    assert.ok(j.blockedAt && j.verifiedAt);
    [c, j] = await req('GET', '/shops/current', null, { tok: TAILOR.tok, shop: SHOP });
    assert.equal(c, 403);
    assert.equal(j.error.key, 'shop_blocked');
    [c, j] = await req('GET', '/admin/shops?status=blocked', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 1);
    await req('PATCH', `/admin/shops/${SHOP}`, { blocked: false }, { tok: BOSS.tok, expect: 200 });
    await req('GET', '/shops/current', null, { tok: TAILOR.tok, shop: SHOP, expect: 200 });
    // Delete / restore
    await req('POST', `/admin/shops/${SHOP2}/delete`, {}, { tok: BOSS.tok, expect: 200 });
    [c] = await req('GET', '/shops/current', null, { tok: T2.tok, shop: SHOP2 });
    assert.equal(c, 403);
    [c, j] = await req('GET', '/admin/shops?status=deleted', null, { tok: BOSS.tok, expect: 200 });
    assert.deepEqual(j.items.map((s) => s.id), [SHOP2]);
    await req('POST', `/admin/shops/${SHOP2}/restore`, {}, { tok: BOSS.tok, expect: 200 });
    await req('GET', '/shops/current', null, { tok: T2.tok, shop: SHOP2, expect: 200 });
    ok('block / unblock shop (app gets shop_blocked), verify, delete / restore');

    console.log('USERS');
    [c, j] = await req('GET', '/admin/users?q=9822222222', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.items.length, 1);
    assert.equal(j.items[0].shops[0].name, 'Riya Boutique');
    const U2 = j.items[0].id;
    [c, j] = await req('GET', `/admin/users/${U2}`, null, { tok: BOSS.tok, expect: 200 });
    assert.ok(j.sessions.length >= 1);
    await req('PATCH', `/admin/users/${U2}`, { isActive: false }, { tok: BOSS.tok, expect: 200 });
    [c] = await req('GET', '/auth/me', null, { tok: T2.tok });
    assert.equal(c, 401, 'blocked user logged out');
    [c] = await req('PATCH', `/admin/users/${BOSS.id}`, { isActive: false }, { tok: BOSS.tok });
    assert.equal(c, 403, 'cannot block yourself');
    await req('PATCH', `/admin/users/${U2}`, { isActive: true }, { tok: BOSS.tok, expect: 200 });
    [c, j] = await req('POST', `/admin/users/${TAILOR.id}/logout-all`, {}, { tok: BOSS.tok, expect: 200 });
    assert.ok(j.sessionsClosed >= 1);
    [c] = await req('GET', '/auth/me', null, { tok: TAILOR.tok });
    assert.equal(c, 401);
    ok('search users, block (sessions closed), self-block refused, logout everywhere');

    console.log('MARKETPLACE SETTINGS');
    [c, j] = await req('GET', '/admin/marketplace-settings', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.commission.enabled, false);
    assert.equal(j.features.deals.enabled, false);
    assert.deepEqual(j.features.waitlist.plans, ['free', 'growth', 'pro']);
    [c, j] = await req('PUT', '/admin/marketplace-settings', { commission: { enabled: true, stitchingPct: 5 },
      features: { deals: { enabled: true, plans: ['pro', 'growth'] }, waitlist: { enabled: false } }, rules: { maxAdvancePct: 30 } }, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.commission.enabled, true);
    assert.equal(j.commission.stitchingPct, 5);
    assert.equal(j.commission.fabricPct, 3, 'untouched default stays');
    assert.ok(j.commission.startsAt, 'start date set when turned on');
    assert.deepEqual(j.features.deals, { enabled: true, plans: ['growth', 'pro'] });
    assert.deepEqual(j.features.waitlist.plans, ['free', 'growth', 'pro'], 'partial update keeps default plans');
    assert.equal(j.rules.maxAdvancePct, 30);
    for (const bad of [{ commission: { stitchingPct: 80 } }, { features: { hack: { enabled: true } } }, { features: { deals: { plans: ['gold'] } } }, { rules: { maxAdvancePct: 101 } }, {}]) {
      [c] = await req('PUT', '/admin/marketplace-settings', bad, { tok: BOSS.tok });
      assert.equal(c, 400, JSON.stringify(bad));
    }
    [c, j] = await req('GET', '/public/marketplace-config', null, { expect: 200 });
    assert.equal(j.commissionEnabled, true);
    assert.equal(j.features.deals.enabled, true);
    assert.equal(j.features.waitlist.enabled, false);
    ok('commission + features + rules: save, validate, public config for apps');

    console.log('BROADCAST');
    [c, j] = await req('POST', '/admin/broadcast', { title: 'Hi', target: 'all', dryRun: true }, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.shopCount, 2);
    [c, j] = await req('POST', '/admin/broadcast', { title: 'Hi', target: 'city', city: 'ambala', dryRun: true }, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.shopCount, 1);
    [c, j] = await req('POST', '/admin/broadcast', { title: 'Hi', target: 'tier', tier: 'pro', dryRun: true }, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.shopCount, 0);
    [c] = await req('POST', '/admin/broadcast', { title: 'Hi', target: 'tier', tier: 'pro' }, { tok: BOSS.tok });
    assert.equal(c, 400, 'no shops');
    [c] = await req('POST', '/admin/broadcast', { title: '', target: 'all' }, { tok: BOSS.tok });
    assert.equal(c, 400);
    [c, j] = await req('POST', '/admin/broadcast', { title: 'New: online booking', body: 'Turn on your online shop', target: 'all' }, { tok: BOSS.tok, expect: 201 });
    assert.equal(j.shopCount, 2);
    assert.equal(await M.Notification.countDocuments({ type: 'admin_broadcast' }), 2);
    [c, j] = await req('GET', '/admin/broadcasts', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 1);
    ok('broadcast: dry run counts (all / city / tier), sends in-app notification to each shop, history');

    console.log('FESTIVALS');
    [c, j] = await req('POST', '/admin/festivals', { name: 'Diwali', nameHi: 'दिवाली', date: '2026-11-08' }, { tok: BOSS.tok, expect: 201 });
    const FEST = j.id;
    [c, j] = await req('GET', '/admin/festivals', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.length, 1);
    await req('DELETE', `/admin/festivals/${FEST}`, null, { tok: BOSS.tok, expect: 200 });
    [c, j] = await req('GET', '/admin/festivals', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.length, 0);
    ok('festivals list / add / delete');

    console.log('ADMINS + AUDIT');
    [c, j] = await req('POST', '/admin/admins', { email: 'Helper@Example.com', name: 'Ravi', role: 'support' }, { tok: BOSS.tok, expect: 201 });
    const HELPER_ADMIN = j.id;
    [c] = await req('POST', '/admin/admins', { email: 'helper@example.com' }, { tok: BOSS.tok });
    assert.equal(c, 409);
    [c] = await req('POST', '/admin/admins', { email: 'boss@example.com' }, { tok: BOSS.tok });
    assert.equal(c, 409, 'env admin already');
    [c] = await req('POST', '/admin/admins', { email: 'nope' }, { tok: BOSS.tok });
    assert.equal(c, 400);
    const HELPER = await emailLogin('helper@example.com', 'Ravi');
    [c, j] = await req('GET', '/admin/me', null, { tok: HELPER.tok, expect: 200 });
    assert.equal(j.role, 'support');
    await req('GET', '/admin/shops', null, { tok: HELPER.tok, expect: 200 });
    [c, j] = await req('PATCH', `/admin/shops/${SHOP}`, { adminNote: 'x' }, { tok: HELPER.tok });
    assert.equal(c, 403);
    assert.equal(j.error.key, 'admin_readonly');
    [c] = await req('PATCH', `/admin/admins/${HELPER_ADMIN}`, { role: 'owner' }, { tok: HELPER.tok });
    assert.equal(c, 403);
    await req('PATCH', `/admin/admins/${HELPER_ADMIN}`, { role: 'owner' }, { tok: BOSS.tok, expect: 200 });
    await req('PATCH', `/admin/shops/${SHOP}`, { adminNote: 'helper note' }, { tok: HELPER.tok, expect: 200 });
    [c, j] = await req('GET', '/admin/admins', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.filter((a) => a.source === 'env').length, 2);
    assert.equal(j.filter((a) => a.source === 'panel').length, 1);
    await req('PATCH', `/admin/admins/${HELPER_ADMIN}`, { isActive: false }, { tok: BOSS.tok, expect: 200 });
    [c] = await req('GET', '/admin/me', null, { tok: HELPER.tok });
    assert.equal(c, 403, 'disabled admin');
    await req('DELETE', `/admin/admins/${HELPER_ADMIN}`, null, { tok: BOSS.tok, expect: 200 });
    // Audit log
    await new Promise((r) => setTimeout(r, 300));
    [c, j] = await req('GET', `/admin/audit-log?targetId=${SHOP}`, null, { tok: BOSS.tok, expect: 200 });
    const actions = j.items.map((x) => x.action);
    assert.ok(actions.includes('PATCH /shops/:id'), actions.join(' | '));
    assert.ok(actions.includes('POST /shops/:id/subscription/extend'));
    assert.ok(j.items.some((x) => x.email === 'helper@example.com'));
    [c, j] = await req('GET', '/admin/audit-log?q=broadcast', null, { tok: BOSS.tok, expect: 200 });
    assert.equal(j.total, 1);
    assert.equal(await M.AdminLog.countDocuments({ action: /^GET/ }), 0, 'reads are not logged');
    [c, j] = await req('GET', `/admin/shops/${SHOP}`, null, { tok: BOSS.tok, expect: 200 });
    assert.ok(j.adminLog.length >= 3);
    ok('add support admin (view-only), promote to owner, disable, remove; audit log per shop');

    console.log('\nALL ADMIN TESTS PASSED');
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
