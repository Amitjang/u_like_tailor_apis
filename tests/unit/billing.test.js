const test = require('node:test');
const assert = require('node:assert');
const { compute } = require('../../src/utils/billing');

const plan = (code, tier, billingPeriod, pricePaise) => ({ _id: code, code, tier, billingPeriod, pricePaise });
const growth = plan('growth', 'growth', 'monthly', 14900);
const growthY = plan('growth_yearly', 'growth', 'yearly', 149000);
const pro = plan('pro', 'pro', 'monthly', 29900);
const free = plan('free', 'free', 'monthly', 0);
const now = new Date('2026-10-08T12:00:00Z');
const DAY = 86400000;
const cur = (p, endsInMs) => ({ plan: p, status: 'active', startsAt: new Date('2026-09-08T12:00:00Z'), endsAt: new Date(now.getTime() + endsInMs) });

test('Free se naya plan', () => {
  const pv = compute(now, { plan: free, status: 'active', endsAt: null }, growth);
  assert.strictEqual(pv.kind, 'new');
  assert.strictEqual(pv.endsAt.toISOString(), '2026-11-08T12:00:00.000Z');
});

test('khatam paid plan = naya', () => {
  const pv = compute(now, cur(growth, -3600000), growth);
  assert.strictEqual(pv.kind, 'new');
});

test('renew: purani end date ke baad jud jaata hai', () => {
  const c = cur(growth, 10 * DAY);
  const pv = compute(now, c, growth);
  assert.strictEqual(pv.kind, 'renew');
  assert.strictEqual(pv.endsAt.toISOString(), '2026-11-18T12:00:00.000Z');
});

test('upgrade: bache din jud jaate hain', () => {
  const pv = compute(now, cur(growth, 15.5 * DAY), pro);
  assert.strictEqual(pv.kind, 'upgrade');
  assert.strictEqual(pv.carriedOverDays, 8);
});

test('downgrade aur switch', () => {
  const d = compute(now, cur(pro, 20 * DAY), growth);
  assert.strictEqual(d.kind, 'downgrade');
  assert.ok(d.carriedOverDays >= 39);
  const s = compute(now, cur(growth, 20 * DAY), growthY);
  assert.strictEqual(s.kind, 'switch');
  assert.ok(s.carriedOverDays >= 19);
});
