const test = require('node:test');
const assert = require('node:assert');
const { parse } = require('../../src/utils/voice');

const fields = [
  { key: 'chest', aliases: ['chest', 'chhati', 'seena', 'सीना', 'छाती'] },
  { key: 'waist', aliases: ['waist', 'kamar', 'कमर'] },
  { key: 'length', aliases: ['length', 'lambai', 'लंबाई'] },
  { key: 'sleeve', aliases: ['sleeve', 'baju', 'बाजू'] },
  { key: 'shoulder', aliases: ['shoulder', 'kandha', 'कंधा'] },
  { key: 'front_neck', aliases: ['front neck', 'aage gala'] },
];

test('bole gaye naap (Roman Hindi, Devanagari, English)', () => {
  const cases = [
    ['chest 38, kamar 32 aur lambai 42', { chest: 38, waist: 32, length: 42 }],
    ['chhati 38 aur aadha kamar 32.5', { chest: 38.5, waist: 32.5 }],
    ['सीना ३८ कमर साढ़े 32', { chest: 38, waist: 32.5 }],
    ['baju 24 point 5 inch, kandha sawa 17', { sleeve: 24.5, shoulder: 17.25 }],
    ['Length: 42 inches, chest is 40 and a half', { length: 42, chest: 40.5 }],
    ['kamar paune 34', { waist: 33.75 }],
    ['aage gala 7', { front_neck: 7 }],
  ];
  for (const [input, want] of cases) assert.deepStrictEqual(parse(input, fields).values, want, input);
});

test('anjaan shabd alag', () => {
  assert.deepStrictEqual(parse('chest 38 xyz', fields).unmatched, ['xyz']);
});
