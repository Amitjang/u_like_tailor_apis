const test = require('node:test');
const assert = require('node:assert');
const { normalizePhone } = require('../../src/utils/phone');
const { rupees, gstSplit } = require('../../src/utils/money');
const { render, templateVars, shareUrl } = require('../../src/utils/template');
const { todayIST, addDays, istDateTime, isDateStr } = require('../../src/utils/dates');
const { sign, razorpay } = require('../../src/utils/razorpay');

test('phone normalize', () => {
  for (const s of ['9876543210', '98765 43210', '+91-98765-43210', '09876543210', '919876543210']) {
    assert.strictEqual(normalizePhone(s), '+919876543210', s);
  }
  for (const s of ['12345', '1234567890', 'abc', '']) assert.strictEqual(normalizePhone(s), null, s);
});

test('rupees + GST', () => {
  assert.strictEqual(rupees(0), '0');
  assert.strictEqual(rupees(15050), '150.50');
  assert.strictEqual(rupees(125000), '1,250');
  assert.strictEqual(rupees(12345678900), '12,34,56,789');
  assert.deepStrictEqual(gstSplit(299000), { taxablePaise: 253390, gstPaise: 45610 });
});

test('template', () => {
  assert.strictEqual(render('नमस्ते {{customer_name}} जी, बाकी ₹{{ balance }}', { customer_name: 'राम', balance: '500' }), 'नमस्ते राम जी, बाकी ₹500');
  assert.deepStrictEqual(templateVars('{{a}} {{b}} {{a}}'), ['a', 'b']);
  assert.ok(shareUrl('+919999911111', 'hi there').startsWith('https://wa.me/919999911111?text=hi%20there'));
});

test('dates (IST)', () => {
  assert.strictEqual(todayIST(new Date('2026-10-08T19:00:00Z')), '2026-10-09');
  assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(istDateTime('2026-10-08', '10:00').toISOString(), '2026-10-08T04:30:00.000Z');
  assert.ok(isDateStr('2026-02-28') && !isDateStr('2026-02-30') && !isDateStr('08-10-2026'));
});

test('razorpay signatures', () => {
  const r = razorpay({ keyId: 'rzp_test_x', keySecret: 'secret123', webhookSecret: 'whsec' });
  const sig = sign('order_1|pay_1', 'secret123');
  assert.ok(r.verifyPayment('order_1', 'pay_1', sig));
  assert.ok(!r.verifyPayment('order_1', 'pay_2', sig));
  const body = '{"event":"payment.captured"}';
  assert.ok(r.verifyWebhook(body, sign(body, 'whsec')));
  assert.ok(!r.verifyWebhook(body, sign(body, 'wrong')));
});
