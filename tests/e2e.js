// End-to-end test: login se lekar subscription kharid, sync aur worker tak poora flow — English + Hindi dono.
// KHAALI database par server in settings ke saath chalayein:
//   MONGO_URI=mongodb://127.0.0.1:27017/tailor_e2e PORT=8080 DEV_FIXED_OTP=123456 RUN_WORKER=true ADMIN_PHONES=9876543210
//   RAZORPAY_KEY_ID=rzp_test_e2e RAZORPAY_KEY_SECRET=e2e_key_secret RAZORPAY_WEBHOOK_SECRET=e2e_wh_secret
//   RAZORPAY_BASE_URL=http://127.0.0.1:8099      (yeh test khud ek nakli Razorpay server chalata hai)
// phir:  MONGO_URI=... API_URL=http://localhost:8080/api npm run e2e
// (Test purane path likhta hai — toApi() unhe naye /api/... path + X-Shop-Id header mein badalta hai.)
const assert = require('assert/strict');
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

const B = process.env.API_URL || 'http://localhost:8080/api';
const RZP_KEY = process.env.RAZORPAY_KEY_ID || 'rzp_test_e2e';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || 'e2e_key_secret';
const RZP_WH = process.env.RAZORPAY_WEBHOOK_SECRET || 'e2e_wh_secret';
const LAST = {};
const uuid = () => crypto.randomUUID();
const ok = (m) => console.log('  ✓', m);
const section = (s) => console.log(s);

// Purana path -> naya: [path, shopId]
function toApi(p) {
  const [pathOnly, qs] = p.split('?');
  const q = qs ? '?' + qs : '';
  const fixed = { '/languages': '/public/languages', '/plans': '/public/plans', '/me': '/auth/me' };
  if (fixed[pathOnly]) return [fixed[pathOnly] + q, null];
  const m = pathOnly.match(/^\/shops\/([^/]+)(\/.*)?$/);
  if (!m) return [p, null];
  const shopId = m[1];
  let r = m[2] || '';
  const rules = [
    [/^$/, '/shops/current'],
    [/^\/subscription\/(preview|checkout|verify|payments)$/, '/billing/$1'],
    [/^\/subscription$/, '/shops/subscription'],
    [/^\/team(.*)$/, '/shops/team$1'],
    [/^\/garment-types(.*)$/, '/services$1'],
    [/^\/voice\/parse$/, '/services/voice/parse'],
    [/^\/customer-members\/(.*)$/, '/customers/members/$1'],
    [/^\/scan\/(.*)$/, '/orders/scan/$1'],
    [/^\/order-items\/(.*)$/, '/orders/items/$1'],
    [/^\/dues$/, '/payments/dues'],
    [/^\/staff(.*)$/, '/workers$1'],
    [/^\/piece-rates$/, '/workers/piece-rates'],
    [/^\/attendance$/, '/workers/attendance'],
    [/^\/assignments\/(.*)$/, '/workers/assignments/$1'],
    [/^\/reports\/monthly$/, '/dashboard/reports/monthly'],
    [/^\/automation-rules(.*)$/, '/messages/automation-rules$1'],
    [/^\/message-templates(.*)$/, '/messages/templates$1'],
  ];
  for (const [rx, to] of rules) if (rx.test(r)) return [r.replace(rx, to) + q, shopId];
  return [r + q, shopId];
}

async function req(method, path, body, { tok, expect, lang, headers } = {}) {
  const h = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (tok) h.Authorization = 'Bearer ' + tok;
  if (lang) h['X-Language'] = lang;
  const [p, shopId] = toApi(path);
  if (shopId) h['X-Shop-Id'] = shopId;
  const res = await fetch(B + p, { method, headers: h, body: body === undefined || body === null ? undefined : JSON.stringify(body) });
  LAST.lang = res.headers.get('content-language');
  const txt = await res.text();
  let j = txt ? JSON.parse(txt) : null;
  if (j && typeof j.success === 'boolean') {
    assert.equal(typeof j.message, 'string', 'envelope message');
    if (j.success) j = j.data;
  }
  if (expect && res.status !== expect) throw new Error(`FAIL ${method} ${p}: ${res.status} ${txt.slice(0, 800)}`);
  return [res.status, j];
}

// ---------- Nakli Razorpay (Orders API) ----------
const FAKE = { n: 0, fail: false, orders: {} };
const fakeServer = http.createServer((rq, rs) => {
  let raw = '';
  rq.on('data', (c) => { raw += c; });
  rq.on('end', () => {
    const want = 'Basic ' + Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString('base64');
    if (rq.url !== '/v1/orders' || rq.headers.authorization !== want || FAKE.fail) {
      rs.writeHead(FAKE.fail ? 500 : 401);
      return rs.end('{"error":{"code":"BAD_REQUEST_ERROR"}}');
    }
    const body = JSON.parse(raw);
    FAKE.n++;
    const id = `order_e2e${String(FAKE.n).padStart(4, '0')}`;
    FAKE.orders[id] = body;
    rs.writeHead(200, { 'Content-Type': 'application/json' });
    rs.end(JSON.stringify({ id, entity: 'order', amount: body.amount, currency: 'INR', receipt: body.receipt, status: 'created', notes: body.notes }));
  });
});

const rzpSig = (msg, secret) => crypto.createHmac('sha256', secret).update(msg).digest('hex');

async function webhook(event, orderId, payId, amount, { method = 'upi', err = null, secret = RZP_WH } = {}) {
  const raw = JSON.stringify({ entity: 'event', event, payload: { payment: { entity: {
    id: payId, order_id: orderId, amount, currency: 'INR', method, status: err ? 'failed' : 'captured', error_description: err } } } });
  const res = await fetch(B + '/webhooks/razorpay', { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': rzpSig(raw, secret) } });
  return res.status;
}

const db = () => mongoose.connection.db;
const addDaysISO = (n) => {
  const d = new Date(Date.now() + 330 * 60000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  await new Promise((r) => fakeServer.listen(8099, '127.0.0.1', r));
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tailor_e2e');
  let c; let j;

  section('LANGUAGES');
  [c, j] = await req('GET', '/languages', null, { expect: 200 });
  assert.deepEqual(j.languages.map((l) => l.code), ['hi', 'en']);
  assert.equal(j.default, 'hi');
  ok('GET /languages -> hi, en');
  [c, j] = await req('POST', '/auth/otp/send', { phone: '12' });
  assert.equal(j.error.key, 'phone_invalid');
  assert.equal(j.error.message, 'मोबाइल नंबर गलत है');
  assert.equal(LAST.lang, 'hi');
  ok('default Hindi error: ' + j.error.message);
  [c, j] = await req('POST', '/auth/otp/send', { phone: '12' }, { lang: 'en' });
  assert.equal(j.error.message, 'Invalid mobile number');
  assert.equal(LAST.lang, 'en');
  ok('X-Language: en -> ' + j.error.message);
  await req('POST', '/auth/otp/send', { phone: '12' }, { headers: { 'Accept-Language': 'en-IN,en;q=0.9' } });
  assert.equal(LAST.lang, 'en');
  await req('POST', '/auth/otp/send?lang=hi', { phone: '12' }, { headers: { 'Accept-Language': 'en-IN' } });
  assert.equal(LAST.lang, 'hi');
  ok('Accept-Language + ?lang override');

  section('AUTH');
  [c, j] = await req('POST', '/auth/otp/send', { phone: '98765 43210' }, { expect: 200, lang: 'en' });
  assert.equal(j.devOtp, '123456');
  ok('otp send, phone normalized ' + j.phone);
  [c, j] = await req('POST', '/auth/otp/verify', { phone: '9876543210', otp: '000000' }, { lang: 'en' });
  assert.equal(c, 400);
  assert.equal(j.error.message, 'Wrong OTP');
  ok('wrong otp -> 400 (English)');
  [c, j] = await req('POST', '/auth/otp/verify', { phone: '9876543210', otp: '123456', deviceId: 'dev1' }, { expect: 200, lang: 'en' });
  let T = j.tokens.accessToken;
  const RT = j.tokens.refreshToken;
  assert.ok(j.isNewUser);
  assert.equal(j.me.user.preferredLanguage, 'en');
  assert.deepEqual(j.me.supportedLanguages, ['hi', 'en']);
  ok('login: new user saved with preferredLanguage=en');
  [c, j] = await req('POST', '/auth/refresh', { refreshToken: RT }, { expect: 200 });
  T = j.tokens.accessToken;
  [c] = await req('POST', '/auth/refresh', { refreshToken: RT });
  assert.equal(c, 401);
  ok('refresh rotation (old token rejected)');
  [c, j] = await req('GET', `/shops/${uuid()}/customers`, null, { tok: T });
  assert.equal(c, 403);
  assert.equal(j.error.message, 'You are not a member of this shop');
  assert.equal(LAST.lang, 'en');
  ok('saved user language (en) used without header');
  [c, j] = await req('PATCH', '/me', { preferredLanguage: 'fr' }, { tok: T });
  assert.equal(c, 400);
  assert.equal(j.error.key, 'language_invalid');
  ok('unsupported language -> 400');
  [c, j] = await req('PATCH', '/me', { name: 'Ram Darzi', preferredLanguage: 'hi' }, { tok: T, expect: 200 });
  assert.equal(j.user.preferredLanguage, 'hi');
  assert.equal(LAST.lang, 'hi');
  [c, j] = await req('GET', `/shops/${uuid()}/customers`, null, { tok: T });
  assert.equal(j.error.message, 'आप इस दुकान के सदस्य नहीं हैं');
  ok('PATCH /me -> Hindi: ' + j.error.message);
  [c, j] = await req('GET', `/shops/${uuid()}/customers`, null, { tok: T, lang: 'en' });
  assert.equal(j.error.message, 'You are not a member of this shop');
  ok('X-Language overrides saved preference');
  [c] = await req('GET', '/me');
  assert.equal(c, 401);

  section('SHOP');
  let shop;
  [c, shop] = await req('POST', '/shops', { name: 'U Like Tailors', city: 'Rewari', upiId: 'ramdarzi@upi', phone: '9876543210' }, { tok: T, expect: 201 });
  const S = '/shops/' + shop.id;
  assert.equal(shop.defaultLanguage, 'hi');
  ok('shop created, defaultLanguage=hi (user ki bhasha)');
  [c, j] = await req('GET', S + '/subscription', null, { tok: T, expect: 200 });
  assert.equal(j.plan.code, 'free');
  assert.equal(j.plan.displayName, 'मुफ़्त');
  [c, j] = await req('GET', '/plans', null, { lang: 'en', expect: 200 });
  assert.equal(j[0].displayName, 'Free');
  assert.ok(j[0].displayDescription.startsWith('For small'));
  [c, j] = await req('GET', '/plans', null, { lang: 'hi', expect: 200 });
  assert.equal(j[0].displayName, 'मुफ़्त');
  ok('plans in both languages');
  [c, j] = await req('GET', S + '/automation-rules', null, { tok: T, expect: 200 });
  assert.equal(j.rules.length, 8);
  assert.equal(j.planAllowsAutomation, false);
  assert.deepEqual(Object.keys(j.rules[0].templateBody).sort(), ['en', 'hi']);
  ok('8 default rules, each with hi + en template');
  [c, j] = await req('POST', S + '/team', { phone: '9811111111', role: 'staff' }, { tok: T });
  assert.equal(c, 402);
  assert.ok(j.error.message.includes('प्रो प्लान'), j.error.message);
  ok('team on free plan -> 402 (Hindi)');

  section('GARMENTS + VOICE');
  let gts;
  [c, gts] = await req('GET', S + '/garment-types', null, { tok: T, expect: 200 });
  const kurta = gts.find((g) => g.code === 'kurta');
  const shirt = gts.find((g) => g.code === 'shirt');
  assert.equal(kurta.displayName, 'कुर्ता');
  assert.equal(kurta.fields[1].displayLabel, 'छाती');
  [c, j] = await req('GET', S + '/garment-types', null, { tok: T, expect: 200, lang: 'en' });
  assert.equal(j.find((g) => g.code === 'kurta').displayName, 'Kurta');
  ok('garment names: कुर्ता / Kurta, field label छाती / Chest');
  [c, j] = await req('POST', S + '/voice/parse', { garmentTypeId: kurta.id, transcript: 'chhati 38 aur aadha, kamar 32, lambai 42, kandha sawa 17, baju 24' }, { tok: T, expect: 200 });
  assert.deepEqual(j.values, { chest: 38.5, waist: 32, length: 42, shoulder: 17.25, sleeve: 24 });
  [c, j] = await req('POST', S + '/voice/parse', { garmentTypeId: kurta.id, transcript: 'सीना ३८ कमर साढ़े 32' }, { tok: T, expect: 200 });
  assert.deepEqual(j.values, { chest: 38, waist: 32.5 });
  assert.ok(j.warnings.some((w) => w.includes('कंधा')), JSON.stringify(j.warnings));
  [c, j] = await req('POST', S + '/voice/parse', { garmentTypeId: kurta.id, transcript: 'chest 40 and a half, length 42' }, { tok: T, expect: 200, lang: 'en' });
  assert.deepEqual(j.values, { chest: 40.5, length: 42 });
  assert.ok(j.warnings.some((w) => w.includes('Shoulder')));
  ok('voice: Roman Hindi, Devanagari, English (warnings in request language)');
  let sher;
  [c, sher] = await req('POST', S + '/garment-types', { code: 'sherwani', name: 'Sherwani', nameHi: 'शेरवानी', defaultRatePaise: 350000, defaultDays: 10,
    fields: [{ key: 'chest', label: 'Chest', labelHi: 'छाती', voiceAliases: ['chhati'] }, { key: 'length', label: 'Length' }] }, { tok: T, expect: 201 });
  assert.equal(sher.fields.length, 2);
  assert.equal(sher.displayName, 'शेरवानी');
  ok('custom garment शेरवानी');
  [c, j] = await req('PATCH', S + '/garment-types/' + kurta.id, { name: 'X' }, { tok: T });
  assert.equal(c, 404);
  assert.equal(j.error.key, 'garment_not_found_or_system');
  await req('PUT', S + '/garment-types/' + sher.id + '/fields', { fields: [{ key: 'chest', label: 'Chest' }, { key: 'waist', label: 'Waist' }] }, { tok: T, expect: 200 });
  ok('system garment protected, fields replaced');

  section('CUSTOMERS');
  let cust;
  [c, cust] = await req('POST', S + '/customers', { name: 'Mohan Lal', phone: '+91 99999 11111', tags: ['VIP'],
    members: [{ name: 'Mohan Lal', relation: 'self' }, { name: 'Aarav', relation: 'son', gender: 'male', dateOfBirth: '2015-' + addDaysISO(0).slice(5) }] }, { tok: T, expect: 201 });
  assert.equal(cust.phone, '+919999911111');
  assert.equal(cust.members.length, 2);
  assert.equal(cust.effectiveLanguage, 'hi');
  const selfM = cust.members[0].id;
  const son = cust.members[1].id;
  ok('customer + family (effectiveLanguage = shop default hi)');
  let custEn;
  [c, custEn] = await req('POST', S + '/customers', { name: 'John Mathew', phone: '9888877777', preferredLanguage: 'en' }, { tok: T, expect: 201 });
  assert.equal(custEn.effectiveLanguage, 'en');
  const john = custEn.members[0].id;
  [c, j] = await req('POST', S + '/customers', { name: 'X', phone: '9777766666', preferredLanguage: 'pa' }, { tok: T });
  assert.equal(c, 400);
  assert.equal(j.error.code, 'invalid_value');
  ok('English-speaking customer, invalid language rejected');
  [c, j] = await req('POST', S + '/customers', { name: 'Dup', phone: '9999911111' }, { tok: T });
  assert.equal(c, 409);
  assert.equal(j.error.code, 'already_exists');
  ok('duplicate phone -> 409');
  [c, j] = await req('GET', S + '/customers/lookup?phone=09999911111', null, { tok: T, expect: 200 });
  assert.equal(j.id, cust.id);
  ok('lookup by phone');
  const MP = `${S}/customer-members/${selfM}/measurements`;
  await req('POST', MP, { garmentTypeId: kurta.id, values: { chest: 38.5, waist: 32, length: 42, shoulder: 17, sleeve: 24 }, inputMethod: 'voice' }, { tok: T, expect: 201 });
  [c, j] = await req('POST', MP, { garmentTypeId: kurta.id, values: { chest: 39, waist: 33, length: 42, shoulder: 17, sleeve: 24, neck: 99 } }, { tok: T, expect: 201 });
  assert.equal(j.measurement.version, 2);
  assert.ok(j.warnings.some((w) => w.includes('गला') && w.includes('सीमा')), JSON.stringify(j.warnings));
  ok('measurement v2 + Hindi range warning: ' + j.warnings[0]);
  [c, j] = await req('POST', MP, { garmentTypeId: kurta.id, values: { foo: 1 } }, { tok: T });
  assert.equal(c, 400);
  assert.equal(j.error.key, 'unknown_measurement');
  [c, j] = await req('GET', MP + '?history=true', null, { tok: T, expect: 200 });
  assert.equal(j.length, 2);
  assert.equal(j[0].garment, 'कुर्ता');
  [c, j] = await req('GET', S + '/customers?q=mohan', null, { tok: T, expect: 200 });
  assert.equal(j.items.length, 1);
  ok('history + search');

  section('FABRIC');
  let fab;
  [c, fab] = await req('POST', S + '/fabrics', { name: 'Raymond Cotton', color: 'White', initialQty: 10, lowStockThreshold: 5, costPerUnitPaise: 18000 }, { tok: T, expect: 201 });
  assert.equal(fab.stockQty, 10);
  ok('fabric with opening stock');

  section('ORDERS');
  [c, j] = await req('POST', S + '/orders', { customerId: cust.id, trialDate: addDaysISO(1),
    items: [{ memberId: selfM, garmentTypeId: kurta.id, quantity: 2, ratePaise: 80000, fabricSource: 'shop', fabricId: fab.id, fabricQtyUsed: 6 },
      { memberId: son, garmentTypeId: shirt.id, ratePaise: 50000, designNotes: 'chinese collar' }],
    discountPaise: 10000, advance: { amountPaise: 100000, mode: 'upi' } }, { tok: T, expect: 201 });
  const o = j.order;
  const O = o.id;
  assert.equal(o.orderNumber, 1);
  assert.equal(o.totalPaise, 200000);
  assert.equal(o.paidPaise, 100000);
  assert.equal(o.balancePaise, 100000);
  assert.deepEqual(j.warnings, ['शर्ट का नाप सेव नहीं है']);
  let m = j.message;
  assert.equal(m.queued, false);
  assert.equal(m.language, 'hi');
  assert.ok(m.text.startsWith('नमस्ते Mohan Lal जी') && m.text.includes('कुर्ता x2, शर्ट'), m.text);
  assert.equal(m.reasonCode, 'wa_plan_no_automation');
  assert.ok(m.reason.includes('प्लान'));
  ok('order #1: Hindi warning + Hindi WhatsApp text for Hindi customer');
  assert.equal(o.items[0].measurementSnapshot.chest, 39);
  assert.equal(o.items[0].garment, 'कुर्ता');
  assert.equal((await db().collection('fabrics').findOne({ _id: fab.id })).stockQty, 4);
  [c, j] = await req('GET', S + '/fabrics?lowStock=true', null, { tok: T, expect: 200 });
  assert.equal(j.length, 1);
  assert.equal(j[0].stockStatus, 'low_stock');
  assert.equal(j[0].stockStatusLabel, 'कम स्टॉक');
  ok('snapshot, fabric stock 10 -> 4, low stock label कम स्टॉक');

  [c, j] = await req('POST', S + '/orders', { customerId: custEn.id, items: [{ memberId: john, garmentTypeId: kurta.id, ratePaise: 70000 }] }, { tok: T, expect: 201 });
  m = j.message;
  assert.equal(m.language, 'en');
  assert.ok(m.text.startsWith('Hello John Mathew') && m.text.includes('Items: Kurta'), m.text);
  assert.deepEqual(j.warnings, ['कुर्ता का नाप सेव नहीं है']);
  const OJ = j.order.id;
  ok('English customer gets English WhatsApp ("Hello John Mathew ... Items: Kurta") while darzi sees Hindi');

  section('SUBSCRIPTION KHARIDNA (Growth)');
  let plans;
  [c, plans] = await req('GET', '/plans', null, { lang: 'hi', expect: 200 });
  assert.deepEqual(plans.map((p) => p.code), ['free', 'growth', 'pro', 'growth_yearly', 'pro_yearly']);
  const gy = plans.find((p) => p.code === 'growth_yearly');
  assert.equal(gy.periodLabel, 'हर साल');
  assert.equal(gy.savingsPaise, 14900 * 12 - 149000);
  assert.equal(gy.pricePerMonthPaise, 12417);
  ok(`pricing: ${plans.length} plans, Growth yearly saves ₹${gy.savingsPaise / 100} (${gy.periodLabel})`);
  let pv;
  [c, pv] = await req('GET', S + '/subscription/preview?plan=growth', null, { tok: T, expect: 200 });
  assert.equal(pv.kind, 'new');
  assert.equal(pv.amountPaise, 14900);
  assert.ok(pv.message.startsWith('आपका प्लान आज से शुरू'), pv.message);
  ok('preview: ' + pv.message);
  [c, j] = await req('POST', S + '/subscription/checkout', { planCode: 'free' }, { tok: T });
  assert.equal(c, 400);
  assert.equal(j.error.key, 'plan_not_purchasable');
  [c, j] = await req('POST', S + '/subscription/checkout', { planCode: 'diamond' }, { tok: T });
  assert.equal(c, 404);
  assert.equal(j.error.key, 'plan_not_found');
  FAKE.fail = true;
  [c, j] = await req('POST', S + '/subscription/checkout', { planCode: 'growth' }, { tok: T });
  FAKE.fail = false;
  assert.equal(c, 502);
  assert.equal(j.error.key, 'payment_gateway_error');
  ok('free/unknown plan rejected, gateway down -> 502');
  let co;
  [c, co] = await req('POST', S + '/subscription/checkout', { planCode: 'growth' }, { tok: T, expect: 201 });
  const rz = co.razorpay;
  assert.equal(rz.key, RZP_KEY);
  assert.equal(rz.amount, 14900);
  assert.ok(rz.order_id.startsWith('order_e2e'));
  assert.equal(rz.description, 'U Like Tailor ग्रोथ प्लान');
  assert.equal(rz.prefill.contact, '+919876543210');
  assert.equal(FAKE.orders[rz.order_id].notes.planCode, 'growth');
  ok(`checkout -> Razorpay order ${rz.order_id} ₹${rz.amount / 100} (razorpay_flutter options ready)`);
  [c, j] = await req('POST', S + '/subscription/verify', { razorpayOrderId: rz.order_id, razorpayPaymentId: 'pay_G1', razorpaySignature: 'deadbeef' }, { tok: T });
  assert.equal(c, 400);
  assert.equal(j.error.message, 'पेमेंट की पुष्टि नहीं हो सकी');
  ok('fake signature rejected: ' + j.error.message);
  const sig = rzpSig(rz.order_id + '|pay_G1', RZP_SECRET);
  [c, j] = await req('POST', S + '/subscription/verify', { razorpayOrderId: rz.order_id, razorpayPaymentId: 'pay_G1', razorpaySignature: sig }, { tok: T, expect: 200 });
  assert.equal(j.result.planCode, 'growth');
  assert.equal(j.result.kind, 'new');
  assert.ok(j.result.receiptNumber.endsWith('-000001'), j.result.receiptNumber);
  assert.equal(j.subscription.plan.code, 'growth');
  assert.ok(j.subscription.isPaidPlan);
  assert.ok([30, 31, 32].includes(j.subscription.daysLeft), j.subscription.daysLeft);
  ok(`verify -> Growth active, ${j.subscription.daysLeft} days, receipt ${j.result.receiptNumber}`);
  let j2;
  [c, j2] = await req('POST', S + '/subscription/verify', { razorpayOrderId: rz.order_id, razorpayPaymentId: 'pay_G1', razorpaySignature: sig }, { tok: T, expect: 200 });
  assert.ok(j2.result.alreadyPaid);
  assert.equal(j2.subscription.endsAt, j.subscription.endsAt);
  assert.equal(await webhook('payment.captured', rz.order_id, 'pay_G1', 14900), 200);
  let j3;
  [c, j3] = await req('GET', S + '/subscription', null, { tok: T, expect: 200 });
  assert.equal(j3.endsAt, j.subscription.endsAt);
  assert.equal((await db().collection('subscription_payments').findOne({ gatewayOrderId: rz.order_id })).method, 'upi');
  ok('verify twice + webhook = plan extended only once (idempotent), method=upi from webhook');
  [c, j] = await req('POST', S + '/orders', { customerId: cust.id, promisedDeliveryDate: addDaysISO(-2), items: [{ memberId: son, garmentTypeId: sher.id }] }, { tok: T, expect: 201 });
  const O2 = j.order.id;
  assert.equal(j.order.orderNumber, 3);
  assert.equal(j.order.totalPaise, 350000);
  assert.ok(j.message.queued, JSON.stringify(j.message));
  ok('order #3 default rate 3500 + WhatsApp queued (growth plan)');
  [c, j] = await req('GET', S + '/orders?late=true', null, { tok: T, expect: 200 });
  assert.equal(j.items.length, 1);
  assert.ok(j.items[0].isLate);
  assert.equal(j.items[0].garments, 'शेरवानी');
  [c, j] = await req('GET', S + '/orders?late=true', null, { tok: T, expect: 200, lang: 'en' });
  assert.equal(j.items[0].garments, 'Sherwani');
  ok('late filter, garments list per language');

  const item0 = o.items[0].id;
  const qr = o.items[1].qrCode;
  [c, j] = await req('POST', S + '/orders/' + O + '/status', { status: 'stitching', itemId: item0 }, { tok: T, expect: 200 });
  assert.equal(j.order.status, 'received');
  [c, j] = await req('POST', S + '/scan/' + qr, { status: 'ready' }, { tok: T, expect: 200 });
  assert.equal(j.order.status, 'stitching');
  ok('item-wise status + QR scan');
  [c, j] = await req('POST', S + '/orders/' + O + '/status', { status: 'ready' }, { tok: T, expect: 200 });
  assert.equal(j.order.status, 'ready');
  assert.ok(j.message.queued);
  assert.ok(j.message.text.startsWith('खुशखबरी'), j.message.text);
  [c, j] = await req('POST', S + '/orders/' + O + '/status', { status: 'ready' }, { tok: T, expect: 200 });
  assert.equal(j.message, null);
  [c, j] = await req('POST', S + '/orders/' + O + '/status', { status: 'bogus' }, { tok: T, lang: 'en' });
  assert.equal(c, 400);
  assert.ok(j.error.message.startsWith('Invalid status'), j.error.message);
  ok('order ready -> Hindi WhatsApp (खुशखबरी...), bad status error in English');

  section('PAYMENTS / UDHAAR');
  [c, j] = await req('POST', S + '/payments', { customerId: cust.id, orderId: O, amountPaise: 999999 }, { tok: T });
  assert.equal(c, 400);
  assert.equal(j.error.message, 'रकम बाकी (₹1,000) से ज़्यादा है');
  [c, j] = await req('POST', S + '/payments', { customerId: cust.id, orderId: O, amountPaise: 999999 }, { tok: T, lang: 'en' });
  assert.equal(j.error.message, 'Amount is more than the pending balance (₹1,000)');
  ok('overpay error with amount in both languages');
  [c, j] = await req('GET', S + '/dues', null, { tok: T, expect: 200 });
  assert.equal(j.totalDuePaise, 520000);
  [c, j] = await req('POST', S + '/payments', { customerId: cust.id, amountPaise: 400000, mode: 'cash' }, { tok: T, expect: 201 });
  assert.deepEqual(j.payments.map((p) => p.amountPaise), [350000, 50000]);
  assert.equal(j.customerDuePaise, 50000);
  assert.ok(j.message.text.startsWith('धन्यवाद Mohan Lal जी'), j.message.text);
  ok('udhaar FIFO split [3500, 500] + Hindi thank-you message');
  [c, j] = await req('GET', S + '/payments', null, { tok: T, expect: 200 });
  assert.equal(j.summary.totalPaise, 500000);
  let pl;
  [c, pl] = await req('POST', S + '/orders/' + O + '/payment-link', {}, { tok: T, expect: 201 });
  assert.equal(pl.upiUri, 'upi://pay?pa=ramdarzi@upi&pn=U%20Like%20Tailors&am=500.00&cu=INR&tn=Order%201');
  ok('payments summary + UPI link');

  section('PUBLIC TRACKING');
  const tok = (await db().collection('orders').findOne({ _id: O })).trackingToken;
  [c, j] = await req('GET', '/public/track/' + tok, null, { expect: 200 });
  assert.equal(j.language, 'hi');
  assert.equal(j.statusLabel, 'तैयार');
  assert.equal(j.items[0].garment, 'कुर्ता');
  assert.ok(j.upiPayLink.startsWith('upi://'));
  assert.ok(!JSON.stringify(j.items).includes('phone'));
  ok(`Hindi customer's tracking page: ${j.statusLabel}, pay link`);
  const tokj = (await db().collection('orders').findOne({ _id: OJ })).trackingToken;
  [c, j] = await req('GET', '/public/track/' + tokj, null, { expect: 200 });
  assert.equal(j.language, 'en');
  assert.equal(j.statusLabel, 'Order received');
  assert.equal(j.items[0].garment, 'Kurta');
  [c, j] = await req('GET', '/public/track/' + tokj + '?lang=hi', null, { expect: 200 });
  assert.equal(j.statusLabel, 'ऑर्डर मिला');
  ok("English customer's page in English, ?lang=hi switches");
  [c] = await req('GET', '/public/track/nonexistent0000');
  assert.equal(c, 404);

  section('STAFF');
  let st;
  [c, st] = await req('POST', S + '/staff', { name: 'Salim', phone: '9822222222', role: 'karigar' }, { tok: T, expect: 201 });
  await req('PUT', S + '/piece-rates', { garmentTypeId: sher.id, task: 'stitching', ratePaise: 40000 }, { tok: T, expect: 200 });
  [c, j] = await req('PUT', S + '/piece-rates', { garmentTypeId: sher.id, task: 'stitching', ratePaise: 45000 }, { tok: T, expect: 200 });
  assert.equal(j.ratePaise, 45000);
  const item2 = (await db().collection('orders').findOne({ _id: O2 })).items[0]._id;
  let a;
  [c, a] = await req('POST', S + '/order-items/' + item2 + '/assign', { staffId: st.id, task: 'stitching' }, { tok: T, expect: 201 });
  assert.equal(a.ratePaise, 45000);
  assert.equal(a.garment, 'शेरवानी');
  ok('piece rate upsert, assign uses rate 450');
  await req('PUT', S + '/staff/' + st.id + '/capacity', { items: [{ garmentTypeId: sher.id, piecesPerDay: 1 }] }, { tok: T, expect: 200 });
  await req('PATCH', S + '/assignments/' + a.id, { status: 'done' }, { tok: T, expect: 200 });
  await req('POST', S + '/staff/' + st.id + '/advances', { amountPaise: 10000, mode: 'cash' }, { tok: T, expect: 201 });
  [c, j] = await req('GET', S + '/staff/earnings', null, { tok: T, expect: 200 });
  assert.equal(j[0].payablePaise, 35000);
  [c, j] = await req('POST', S + '/staff/' + st.id + '/payouts', { dryRun: true }, { tok: T, expect: 201 });
  assert.ok(j.dryRun);
  assert.equal(j.payout.netPaidPaise, 35000);
  [c, j] = await req('POST', S + '/staff/' + st.id + '/payouts', { mode: 'upi' }, { tok: T, expect: 201 });
  assert.equal(j.netPaidPaise, 35000);
  ok('earnings 450 - advance 100 = 350 paid');
  [c, j] = await req('PATCH', S + '/assignments/' + a.id, { status: 'assigned' }, { tok: T });
  assert.equal(c, 409);
  assert.equal(j.error.key, 'work_locked');
  await req('PUT', S + '/attendance', { entries: [{ staffId: st.id, status: 'present' }] }, { tok: T, expect: 200 });
  [c, j] = await req('GET', S + '/attendance', null, { tok: T, expect: 200 });
  assert.equal(j[0].status, 'present');
  ok('paid work locked, attendance');

  section('UPGRADE (Pro yearly) + WEBHOOK + HISTORY');
  [c, pv] = await req('GET', S + '/subscription/preview?plan=pro_yearly', null, { tok: T, expect: 200, lang: 'en' });
  assert.equal(pv.kind, 'upgrade');
  assert.equal(pv.fromPlan, 'growth');
  assert.ok(pv.carriedOverDays >= 17 && pv.carriedOverDays <= 19, JSON.stringify(pv));
  ok('preview: ' + pv.message);
  let co2;
  [c, co2] = await req('POST', S + '/subscription/checkout', { planCode: 'pro_yearly' }, { tok: T, expect: 201 });
  const o2 = co2.razorpay.order_id;
  assert.equal(await webhook('order.paid', o2, 'pay_P1', 299000, { secret: 'wrong' }), 400);
  assert.equal(await webhook('payment.failed', o2, 'pay_P0', 299000, { err: 'Payment declined by bank' }), 200);
  const failed = await db().collection('subscription_payments').findOne({ gatewayOrderId: o2 });
  assert.equal(`${failed.status}|${failed.failureReason}`, 'failed|Payment declined by bank');
  ok('bad webhook signature -> 400; failed attempt recorded');
  assert.equal(await webhook('order.paid', o2, 'pay_P1', 1, { method: 'card' }), 200);
  [c, j] = await req('GET', S + '/subscription', null, { tok: T, expect: 200 });
  assert.equal(j.plan.code, 'growth');
  ok('webhook with wrong amount ignored');
  assert.equal(await webhook('order.paid', o2, 'pay_P1', 299000, { method: 'card' }), 200);
  [c, j] = await req('GET', S + '/subscription', null, { tok: T, expect: 200 });
  assert.equal(j.plan.code, 'pro_yearly');
  assert.equal(j.plan.displayName, 'प्रो (सालाना)');
  assert.ok(j.daysLeft >= 382 && j.daysLeft <= 385, j.daysLeft);
  ok(`retry paid via webhook (app closed) -> Pro yearly active, ${j.daysLeft} days left (365 + carried)`);
  let hist;
  [c, hist] = await req('GET', S + '/subscription/payments?status=paid', null, { tok: T, expect: 200 });
  assert.deepEqual(hist.items.map((x) => x.planCode), ['pro_yearly', 'growth']);
  const p0 = hist.items[0];
  assert.ok(p0.receiptNumber.endsWith('-000002'));
  assert.equal(p0.taxablePaise, 253390);
  assert.equal(p0.gstPaise, 45610);
  assert.equal(p0.method, 'card');
  ok(`history: receipts ${hist.items.map((x) => x.receiptNumber)}, ₹2990 = ₹2533.90 + GST ₹456.10`);
  [c, j] = await req('GET', S + '/notifications', null, { tok: T, expect: 200 });
  assert.ok(j.items.some((n) => n.type === 'plan_activated' && n.title === 'प्रो (सालाना) प्लान चालू हो गया'));
  ok('in-app notification: प्रो (सालाना) प्लान चालू हो गया');
  await req('POST', S + '/team', { phone: '9844444444', name: 'Raju', role: 'manager' }, { tok: T, expect: 201 });
  await req('POST', '/auth/otp/send', { phone: '9844444444' }, { expect: 200 });
  [c, j] = await req('POST', '/auth/otp/verify', { phone: '9844444444', otp: '123456' }, { expect: 200 });
  const TM = j.tokens.accessToken;
  [c, j] = await req('POST', S + '/subscription/checkout', { planCode: 'pro' }, { tok: TM });
  assert.equal(c, 403);
  assert.equal(j.error.message, 'यह काम सिर्फ मालिक कर सकते हैं');
  await req('GET', S + '/subscription/payments', null, { tok: TM, expect: 200 });
  ok('Pro allows team; manager can see history but only owner can buy');

  section('APP ADMIN');
  [c, j] = await req('GET', '/admin/plans', null, { tok: TM });
  assert.equal(c, 403);
  assert.equal(j.error.key, 'admin_only');
  [c, j] = await req('GET', '/admin/plans', null, { tok: T, expect: 200 });
  const growthPlan = j.find((p) => p.code === 'growth');
  assert.equal(growthPlan.activeShops, 0);
  assert.equal(j.find((p) => p.code === 'pro_yearly').activeShops, 1);
  [c, j] = await req('PATCH', '/admin/plans/' + growthPlan.id, { pricePaise: 15900 }, { tok: T, expect: 200 });
  assert.equal(j.pricePaise, 15900);
  [c, j] = await req('GET', '/plans', null, { lang: 'en', expect: 200 });
  assert.equal(j.find((p) => p.code === 'growth').pricePaise, 15900);
  assert.equal(j.find((p) => p.code === 'growth_yearly').savingsPaise, 15900 * 12 - 149000);
  ok('non-admin blocked; admin changed Growth price ₹149 -> ₹159 (old receipts unchanged)');
  await req('POST', '/admin/plans', { code: 'pro_quarterly', tier: 'pro', name: 'Pro (3 months)', nameHi: 'प्रो (3 महीने)',
    pricePaise: 79900, billingPeriod: 'quarterly', limits: { maxCustomers: null, whatsappAutomation: true, multiUser: true }, sortOrder: 6 }, { tok: T, expect: 201 });
  [c, j] = await req('GET', '/plans', null, { lang: 'hi', expect: 200 });
  const pq = j.find((p) => p.code === 'pro_quarterly');
  assert.equal(pq.periodLabel, 'हर 3 महीने');
  assert.equal(pq.savingsPaise, 29900 * 3 - 79900);
  ok(`admin created quarterly plan (${pq.displayName}, saves ₹${pq.savingsPaise / 100})`);

  section('FESTIVAL + DASHBOARD + REPORT');
  let f;
  [c, f] = await req('POST', S + '/festivals', { name: 'Wedding season', nameHi: 'शादी का सीज़न', date: addDaysISO(20) }, { tok: T, expect: 201 });
  [c, j] = await req('GET', S + '/festivals/' + f.id + '/capacity', null, { tok: T, expect: 200 });
  const g = j.garments.find((x) => x.garment === 'शेरवानी');
  assert.equal(j.festival.name, 'शादी का सीज़न');
  ok(`capacity: ${j.workingDays} working days, शेरवानी capacity ${g.totalCapacity}, can accept ${g.canAcceptMore}`);
  [c, j] = await req('GET', S + '/festivals', null, { tok: T, expect: 200, lang: 'en' });
  assert.equal(j[0].displayName, 'Wedding season');
  let d;
  [c, d] = await req('GET', S + '/dashboard', null, { tok: T, expect: 200 });
  assert.equal(d.late.count, 1);
  assert.equal(d.money.todayCollectionPaise, 500000);
  assert.equal(d.nextFestival.name, 'शादी का सीज़न');
  ok(`dashboard: late=${d.late.count} ready=${d.readyNotCollected} collection=₹${d.money.todayCollectionPaise / 100}`);
  await req('POST', S + '/expenses', { category: 'rent', amountPaise: 50000 }, { tok: T, expect: 201 });
  [c, j] = await req('GET', S + '/reports/monthly', null, { tok: T, expect: 200 });
  assert.equal(j.profitPaise, 500000 - 50000 - 35000);
  assert.deepEqual(new Set(j.byGarment.map((x) => x.garment)), new Set(['कुर्ता', 'शर्ट', 'शेरवानी']));
  ok(`report: profit ₹${j.profitPaise / 100}, garments in Hindi`);

  section('TEMPLATES');
  [c, j] = await req('GET', S + '/message-templates?language=en', null, { tok: T, expect: 200 });
  assert.equal(j.length, 9);
  assert.ok(j.every((t) => t.language === 'en'));
  [c, j] = await req('PUT', S + '/message-templates/order_ready', { language: 'en', body: 'Hi {{customer_name}}, order #{{order_number}} ready! - {{shop_name}}' }, { tok: T, expect: 200 });
  assert.deepEqual(j.variables, ['customer_name', 'order_number', 'shop_name']);
  assert.equal(j.language, 'en');
  await req('PUT', S + '/message-templates/order_ready', { language: 'en', body: 'Hi {{customer_name}}! Order #{{order_number}} is ready. - {{shop_name}}' }, { tok: T, expect: 200 });
  [c, j] = await req('GET', S + '/message-templates', null, { tok: T, expect: 200 });
  const mine = j.filter((t) => t.event === 'order_ready');
  assert.equal(mine.length, 2);
  assert.ok(mine.find((t) => t.language === 'en').isCustom);
  [c, j] = await req('POST', S + '/orders/' + OJ + '/status', { status: 'ready' }, { tok: T, expect: 200 });
  assert.equal(j.message.text, 'Hi John Mathew! Order #2 is ready. - U Like Tailors');
  ok('custom English template used for English customer');

  section('SYNC');
  [c, j] = await req('POST', S + '/sync/pull', { sinceSeq: 0, deviceId: 'dev1', limit: 3 }, { tok: T, expect: 200 });
  assert.ok(j.hasMore);
  let seq = 0; let n = 0;
  const cols = new Set();
  for (;;) {
    [c, j] = await req('POST', S + '/sync/pull', { sinceSeq: seq, deviceId: 'dev1', limit: 200 }, { tok: T, expect: 200 });
    Object.keys(j.changes).forEach((k) => cols.add(k));
    n++;
    seq = j.nextSeq;
    if (!j.hasMore) break;
  }
  assert.ok(cols.has('orders') && cols.has('customers') && cols.has('garmentTypes'));
  ok(`full pull in ${n} call(s), ${cols.size} collections, nextSeq=${seq}`);
  const now = new Date().toISOString();
  const [cid, mid, oid, iid, pid] = [uuid(), uuid(), uuid(), uuid(), uuid()];
  [c, j] = await req('POST', S + '/sync/push', { deviceId: 'dev1', changes: {
    customers: [{ id: cid, name: 'Offline Customer', phone: '+919800000001', preferredLanguage: 'en', members: [{ _id: mid, name: 'Offline Customer', relation: 'self' }], updatedAt: now }],
    orders: [{ id: oid, customerId: cid, promisedDeliveryDate: '2026-10-20', items: [{ _id: iid, memberId: mid, garmentTypeId: shirt.id, quantity: 1, ratePaise: 60000 }], updatedAt: now }],
    payments: [{ id: pid, customerId: cid, orderId: oid, amountPaise: 20000, purpose: 'advance', mode: 'cash', updatedAt: now }],
  } }, { tok: T, expect: 200 });
  assert.equal(j.accepted.length, 3, JSON.stringify(j));
  assert.equal(j.rejected.length, 0);
  assert.equal(j.assignedOrderNumbers[oid], 4);
  let od;
  [c, od] = await req('GET', S + '/orders/' + oid, null, { tok: T, expect: 200 });
  assert.equal(od.totalPaise, 60000);
  assert.equal(od.paidPaise, 20000);
  assert.ok(od.items[0].qrCode);
  ok('offline push accepted (customer+family, order+items, payment), order got #4, totals + QR tag');
  const old = new Date(Date.now() - 86400000).toISOString();
  [c, j] = await req('POST', S + '/sync/push', { changes: { customers: [{ id: cid, name: 'Stale Name', phone: '+919800000001', updatedAt: old }] } }, { tok: T, expect: 200 });
  assert.equal(j.rejected[0].reasonCode, 'sync_server_newer');
  assert.ok(j.rejected[0].reason.includes('सर्वर'), j.rejected[0].reason);
  [c, j] = await req('POST', S + '/sync/push', { changes: { orders: [{ id: uuid(), customerId: cust.id, promisedDeliveryDate: '2026-10-20',
    items: [{ memberId: uuid(), garmentTypeId: shirt.id }], updatedAt: now }] } }, { tok: T, expect: 200, lang: 'en' });
  assert.equal(j.rejected[0].reason, 'memberId does not belong to this shop');
  ok('stale edit + foreign reference rejected (localized reasons)');
  [c] = await req('POST', S + '/sync/push', { changes: { shops: [{ id: shop.id }] } }, { tok: T });
  assert.equal(c, 400);
  [c, j] = await req('POST', S + '/sync/pull', { sinceSeq: seq }, { tok: T, expect: 200 });
  assert.ok(j.changes.customers && j.changes.orders);
  ok('incremental pull sees pushed docs');

  section('SECURITY');
  await req('POST', '/auth/otp/send', { phone: '9811111111' }, { expect: 200 });
  [c, j] = await req('POST', '/auth/otp/verify', { phone: '9811111111', otp: '123456' }, { expect: 200 });
  const T2 = j.tokens.accessToken;
  assert.equal(j.me.user.preferredLanguage, 'hi');
  [c] = await req('GET', S + '/customers', null, { tok: T2 });
  assert.equal(c, 403);
  let s2;
  [c, s2] = await req('POST', '/shops', { name: 'Other shop' }, { tok: T2, expect: 201 });
  [c] = await req('GET', `/shops/${s2.id}/customers/${cust.id}`, null, { tok: T2 });
  assert.equal(c, 404);
  ok('other user -> 403; cross-shop id -> 404');
  let gr;
  [c, gr] = await req('POST', `/admin/shops/${s2.id}/subscription/grant`, { planCode: 'growth', amountPaise: 0, note: 'launch offer' }, { tok: T, expect: 201 });
  assert.equal(gr.planCode, 'growth');
  assert.equal(gr.kind, 'new');
  [c, j] = await req('GET', `/shops/${s2.id}/subscription`, null, { tok: T2, expect: 200 });
  assert.equal(j.plan.code, 'growth');
  assert.equal(j.plan.displayName, 'ग्रोथ');
  [c, j] = await req('GET', '/admin/subscription-payments?status=paid', null, { tok: T, expect: 200 });
  assert.equal(j.summary.paidCount, 3);
  assert.equal(j.summary.revenuePaise, 14900 + 299000);
  ok(`admin granted free Growth to another shop; revenue ₹${j.summary.revenuePaise / 100} (GST ₹${j.summary.gstPaise / 100})`);
  await req('POST', '/auth/logout', {}, { tok: T2, expect: 200 });
  [c] = await req('GET', '/me', null, { tok: T2 });
  assert.equal(c, 401);
  for (let i = 0; i < 3; i++) await req('POST', '/auth/otp/send', { phone: '9833333333' });
  [c, j] = await req('POST', '/auth/otp/send', { phone: '9833333333' });
  assert.equal(c, 429);
  assert.equal(j.error.key, 'otp_too_many_requests');
  ok('logout kills token; OTP rate limit -> 429');

  section('WORKER');
  await new Promise((r) => setTimeout(r, 7000));
  [c, j] = await req('GET', S + '/messages', null, { tok: T, expect: 200 });
  const sts = j.items.map((x) => x.status);
  const langs = [...new Set(j.items.map((x) => x.language))].sort();
  assert.ok(sts.length && sts.every((s) => s === 'sent'), JSON.stringify(sts));
  assert.deepEqual(langs, ['en', 'hi']);
  ok(`worker sent ${sts.length} messages in languages ${langs}`);

  // Scheduler + hourly jobs (seedha function chala ke — worker ka 1 minute/1 ghanta intezaar nahi)
  const W = require('../src/jobs/worker');
  const M = require('../src/models');
  const queued = await W.schedule({ publicBaseUrl: 'http://localhost' , now: new Date(new Date(addDaysISO(0) + 'T10:05:00+05:30')) });
  const bday = await M.OutboundMessage.findOne({ shopId: shop.id, event: 'birthday' }).lean();
  assert.ok(bday && bday.renderedBody.includes('Aarav'), 'birthday wish for Aarav');
  assert.equal(await W.schedule({ publicBaseUrl: 'http://localhost', now: new Date(new Date(addDaysISO(0) + 'T10:05:00+05:30')) }), 0);
  ok(`scheduler: ${queued} reminder(s) incl. birthday wish for Aarav, second run adds 0 (dedupe)`);
  await M.Shop.updateOne({ _id: shop.id }, { $set: { 'subscription.endsAt': new Date(Date.now() + 2 * 86400000) } });
  const r1 = await W.hourly(new Date());
  assert.equal(r1.planExpiring, 1);
  assert.equal(r1.lowStock, 1);
  assert.equal((await W.hourly(new Date())).planExpiring, 0);
  await M.Shop.updateOne({ _id: shop.id }, { $set: { 'subscription.endsAt': new Date(Date.now() - 60000) } });
  assert.equal(await W.expirePlans(new Date()), 1);
  [c, j] = await req('GET', S + '/subscription', null, { tok: T, expect: 200 });
  assert.equal(j.plan.code, 'free');
  [c, j] = await req('GET', S + '/notifications', null, { tok: T, expect: 200 });
  const types = new Set(j.items.map((x) => x.type));
  assert.ok(types.has('plan_expiring') && types.has('plan_expired') && types.has('low_stock'), [...types].join());
  assert.ok(j.items.some((x) => x.title === 'आपका प्लान खत्म हो गया'));
  ok('hourly: plan expiring (once), low stock, expired -> Free plan (Hindi notification)');

  console.log('\nALL PASSED ✅');
}

main()
  .then(async () => { await mongoose.disconnect(); fakeServer.close(); process.exit(0); })
  .catch((e) => { console.error('\n❌', e.message, e.actual !== undefined ? `\n   actual: ${JSON.stringify(e.actual)}\n   expected: ${JSON.stringify(e.expected)}` : '', '\n', e.stack.split('\n').slice(1, 3).join('\n')); process.exit(1); });
