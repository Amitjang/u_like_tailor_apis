const test = require('node:test');
const assert = require('node:assert');
const i18n = require('../../src/utils/i18n');

const verbs = (s) => (s.match(/%(\[\d+\])?[sdv]/g) || []).sort();

test('har message dono bhashaon mein, format same', () => {
  for (const [k, [en, hi]] of Object.entries(i18n.messages)) {
    assert.ok(en && hi, `${k}: dono bhashaon ka text chahiye`);
    assert.deepStrictEqual(verbs(en), verbs(hi), `${k}: format verbs alag`);
  }
});

test('bhasha pehchanna', () => {
  assert.strictEqual(i18n.parse('EN-in'), 'en');
  assert.strictEqual(i18n.parse('hi_IN'), 'hi');
  for (const bad of ['', 'pa', 'hinglish', 'fr', undefined]) assert.strictEqual(i18n.parse(bad), null);
  assert.strictEqual(i18n.fromAcceptLanguage('fr-FR,hi;q=0.8,en;q=0.5'), 'hi');
});

test('format aur tareekh', () => {
  assert.strictEqual(i18n.t('en', 'plan_limit', 100, i18n.t('en', 'limit_customers')), 'Your plan allows up to 100 customers. Upgrade your plan for more.');
  assert.strictEqual(i18n.t('hi', 'plan_limit', 100, i18n.t('hi', 'limit_customers')), 'आपके प्लान में ग्राहकों की सीमा 100 है। ज़्यादा के लिए प्लान अपग्रेड करें।');
  assert.strictEqual(i18n.date('hi', '2026-10-04'), '04 अक्टूबर');
  assert.strictEqual(i18n.date('en', '2026-10-04'), '04 Oct');
  assert.strictEqual(i18n.dateLong('hi', new Date('2026-11-07T20:00:00Z')), '08 नवंबर 2026'); // IST mein agla din
  assert.strictEqual(i18n.t('en', 'warn_out_of_range', 'Neck', 99), 'Neck = 99 is outside the normal range, please double-check');
});
