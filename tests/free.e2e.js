// Payment BAND (BILLING_ENABLED nahi) = launch offer: har dukaan ko Pro ki saari suvidhayein muft.
//   MONGO_URI=mongodb://127.0.0.1:27017/tailor_free_e2e node tests/free.e2e.js
// (database KHAALI kar diya jaata hai — asli database ka naam mat dena)
const assert = require('assert/strict');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const API_PORT = 8085;
const B = `http://127.0.0.1:${API_PORT}/api`;
const ok = (m) => console.log('  ✓', m);

async function req(method, p, body, { tok, shop, expect } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Language': 'en' };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (shop) h['X-Shop-Id'] = shop;
  const res = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (expect && res.status !== expect) throw new Error(`FAIL ${method} ${p}: ${res.status} ${txt.slice(0, 400)}`);
  const j = txt ? JSON.parse(txt) : null;
  return [res.status, j && j.success ? j.data : j];
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tailor_free_e2e';
  Object.assign(process.env, {
    MONGO_URI: uri, PORT: String(API_PORT), RUN_WORKER: 'false', APP_ENV: 'dev', BILLING_ENABLED: '',
    PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x', WA_PROVIDER: 'log', OTP_PROVIDER: 'log', FIREBASE_SERVICE_ACCOUNT_BASE64: '',
  });
  const mongoose = require('mongoose');
  await mongoose.connect(uri);
  await mongoose.connection.db.dropDatabase();
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', (d) => { out += d; });
  server.stderr.on('data', (d) => { out += d; });
  try {
    for (let i = 0; i < 200 && !/Server running/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, /payments: OFF/);
    const M = require('../src/models');
    const cfg = require('../src/config/env').load();
    const { signAccess, sha256 } = require('../src/utils/auth');
    const u = await M.User.create({ email: 'o@example.com', name: 'Owner', googleId: 'g1', isActive: true });
    const s = await M.Session.create({ userId: u._id, refreshTokenHash: sha256(crypto.randomUUID()), expiresAt: new Date(Date.now() + 86400000) });
    const tok = signAccess(cfg.jwtSecret, u._id, s._id, 3600).token;
    let [c, j] = await req('POST', '/shops', { name: 'Naya Tailor', phone: '9811111111' }, { tok, expect: 201 });
    const SHOP = j.id || j.shop.id;
    const o = { tok, shop: SHOP };

    [c, j] = await req('GET', '/shops/subscription', null, { ...o, expect: 200 });
    assert.equal(j.billingEnabled, false);
    assert.equal(j.plan.code, 'launch_free');
    assert.equal(j.plan.tier, 'pro');
    assert.equal(j.plan.pricePaise, 0);
    assert.equal(j.plan.limits.maxCustomers, null);
    assert.equal(j.plan.limits.multiUser, true);
    assert.equal(j.plan.limits.whatsappAutomation, true);
    assert.equal(j.endsAt, null);
    ok('new shop: plan = Free (all features), unlimited, no end date');

    [c, j] = await req('POST', '/billing/checkout', { planCode: 'pro' }, o);
    assert.equal(c, 403);
    assert.equal(j.error.key, 'billing_off');
    [c] = await req('GET', '/billing/preview?plan=pro', null, o);
    assert.equal(c, 403);
    [c, j] = await req('GET', '/public/app-config?platform=android&version=1.0.0', null, { expect: 200 });
    assert.equal(j.billingEnabled, false);
    ok('buying a plan is off (403 billing_off), app-config says billingEnabled=false');

    // Pro wali cheezein free dukaan par: staff login, WhatsApp automation, booking features
    [c, j] = await req('POST', '/workers', { name: 'Salim', phone: '9812345678', role: 'karigar', payType: 'piece_rate' }, { ...o, expect: 201 });
    await req('PUT', `/workers/${j.id}/access`, { phone: '9812345678', password: 'salim123' }, { ...o, expect: 200 });
    [c, j] = await req('POST', '/workers', { name: 'Ravi', phone: '9812345679', role: 'cutter', payType: 'monthly' }, { ...o, expect: 201 });
    [c, j] = await req('GET', '/messages/automation-rules', null, { ...o, expect: 200 });
    assert.equal(j.planAllowsAutomation, true);
    [c, j] = await req('GET', '/online/settings', null, { ...o, expect: 200 });
    assert.equal(j.tier, 'pro');
    assert.equal(j.features.instantBooking, true);
    assert.equal(j.features.waitlist, true);
    // 100 se zyada customer (Free plan ki purani hadd)
    await M.Customer.insertMany(Array.from({ length: 100 }, (_, i) => ({ shopId: SHOP, name: 'C' + i, phone: '+9190000' + String(i).padStart(5, '0') })));
    await req('POST', '/customers', { name: 'Customer 101', phone: '9876543210' }, { ...o, expect: 201 });
    ok('staff login, 2+ staff, WhatsApp automation, booking features, 101st customer — all allowed for free');

    console.log('\nALL FREE-MODE TESTS PASSED');
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
