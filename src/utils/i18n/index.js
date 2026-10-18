// API ke saare user-facing text English (en) aur Hindi (hi) mein.
// Nayi bhasha jodni ho: SUPPORTED mein code, messages.js mein har message ka teesra text,
// aur models mein LANGS. `npm test` check karta hai ki koi message chhoota na ho.
const messages = require('./messages');
const { IST_OFFSET_MS } = require('../dates');

const EN = 'en';
const HI = 'hi';
const DEFAULT = HI;
const SUPPORTED = [HI, EN];

// "en", "EN-in", "hi_IN" -> "en"/"hi"; baaki -> null
function parse(s) {
  if (!s) return null;
  const code = String(s).trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(code) ? code : null;
}

// "hi-IN,hi;q=0.9,en;q=0.8" -> pehli supported bhasha
function fromAcceptLanguage(h) {
  for (const part of String(h || '').split(',')) {
    const l = parse(part.split(';')[0]);
    if (l) return l;
  }
  return null;
}

// Go jaisa chhota sprintf: %s %d %v aur %[2]s (kram badalne ke liye)
function format(f, args) {
  let i = 0;
  return f.replace(/%(?:\[(\d+)\])?([sdv%])/g, (m, idx, verb) => {
    if (verb === '%') return '%';
    const v = idx ? args[Number(idx) - 1] : args[i++];
    if (verb === 'd') return String(Math.trunc(Number(v)));
    return String(v);
  });
}

// t('hi', 'plan_limit', 100, 'ग्राहकों')
function t(lang, key, ...args) {
  const m = messages[key];
  if (!m) return key;
  const f = lang === HI && m[1] ? m[1] : m[0];
  return args.length ? format(f, args) : f;
}

function has(key) {
  return Object.prototype.hasOwnProperty.call(messages, key);
}

// Naam chunna: pick('hi', 'Kurta', 'कुर्ता') -> 'कुर्ता' (Hindi khaali ho to English)
function pick(lang, en, hi) {
  return lang === HI && hi ? hi : en;
}

const HINDI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Date ya "YYYY-MM-DD" -> IST ke hisaab se [din, mahina(0-11), saal]
function parts(d) {
  if (typeof d === 'string') return [Number(d.slice(8, 10)), Number(d.slice(5, 7)) - 1, Number(d.slice(0, 4))];
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return [x.getUTCDate(), x.getUTCMonth(), x.getUTCFullYear()];
}

// "04 Oct" / "04 अक्टूबर"
function date(lang, d) {
  const [day, mon] = parts(d);
  return `${String(day).padStart(2, '0')} ${lang === HI ? HINDI_MONTHS[mon] : EN_MONTHS[mon]}`;
}

// "08 Nov 2026" / "08 नवंबर 2026"
function dateLong(lang, d) {
  const [, , year] = parts(d);
  return `${date(lang, d)} ${year}`;
}

module.exports = { EN, HI, DEFAULT, SUPPORTED, parse, fromAcceptLanguage, t, has, pick, date, dateLong, format, messages };
