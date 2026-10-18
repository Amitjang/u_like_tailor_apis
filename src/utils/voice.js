// Bole gaye naap ("chest 38, kamar 32 aur aadha", "सीना ३८ कमर साढ़े 32", "chest 40 and a half")
// ko khaanon mein badalta hai. Speech-to-text phone par hota hai; server sirf text samajhta hai.

const DEVANAGARI_DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

const set = (...w) => new Set(w);
const PLUS_HALF_AFTER = set('aadha', 'adha', 'aadhaa', 'half', 'आधा', '½');
const PLUS_HALF_BEFORE = set('saadhe', 'sadhe', 'saade', 'sade', 'साढ़े', 'साढे');
const PLUS_QUARTER = set('sawa', 'sava', 'सवा');
const MINUS_QUARTER = set('paune', 'pone', 'पौने');
const PLUS_QUARTER_WORD = set('quarter', 'pav', 'paav', 'पाव');
const POINT = set('point', 'dashamlav', 'दशमलव');
const FILLER = set('aur', 'and', 'inch', 'inches', 'inchi', 'इंच', 'और', 'hai', 'है', 'cm',
  'ka', 'ki', 'ke', 'का', 'की', 'के', 'is', 'the', 'of', 'a', 'an');

const isNum = (s) => /^\d+(\.\d+)?$/.test(s);
const isFraction = (t) => PLUS_HALF_AFTER.has(t) || PLUS_HALF_BEFORE.has(t) || PLUS_QUARTER.has(t)
  || MINUS_QUARTER.has(t) || PLUS_QUARTER_WORD.has(t) || POINT.has(t);

function tokenize(s) {
  let b = '';
  for (let ch of String(s).toLowerCase()) {
    if (DEVANAGARI_DIGITS[ch]) ch = DEVANAGARI_DIGITS[ch];
    if (ch === '.' || ch === '½') b += ` ${ch} `;
    else if (/[\p{L}\p{N}\p{M}]/u.test(ch)) b += ch;
    else b += ' ';
  }
  // "38 . 5" ko wapas "38.5"
  const raw = b.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '.' && out.length && i + 1 < raw.length && isNum(out[out.length - 1]) && isNum(raw[i + 1])) {
      out[out.length - 1] += '.' + raw[i + 1];
      i++;
    } else if (raw[i] !== '.') {
      out.push(raw[i]);
    }
  }
  return out;
}

// fields: [{ key, aliases: [...] }] -> { values: {chest: 38.5}, unmatched: [...] }
function parse(transcript, fields) {
  const alias = new Map();
  for (const f of fields) {
    alias.set(f.key.toLowerCase(), f.key);
    for (const a of f.aliases || []) alias.set(String(a).trim().toLowerCase(), f.key);
  }
  const toks = tokenize(transcript);
  const values = {};
  const unmatched = [];

  for (let i = 0; i < toks.length; i++) {
    let key = alias.get(toks[i]);
    if (!key && i + 1 < toks.length && alias.has(`${toks[i]} ${toks[i + 1]}`)) {
      key = alias.get(`${toks[i]} ${toks[i + 1]}`); // do shabd wala alias, jaise "front neck"
      i++;
    }
    if (!key) {
      if (!isNum(toks[i]) && !FILLER.has(toks[i]) && !isFraction(toks[i])) unmatched.push(toks[i]);
      continue;
    }
    // Agle 4 shabdon mein number dhoondo
    let adj = 0;
    for (let j = i + 1; j < toks.length && j <= i + 4; j++) {
      const t = toks[j];
      if (alias.has(t)) break; // agla naap shuru, value nahi mili
      if (PLUS_HALF_BEFORE.has(t)) { adj += 0.5; continue; }
      if (PLUS_QUARTER.has(t)) { adj += 0.25; continue; }
      if (MINUS_QUARTER.has(t)) { adj -= 0.25; continue; }
      if (!isNum(t)) continue;
      let v = Number(t);
      let k = j + 1;
      if (k + 1 < toks.length && POINT.has(toks[k]) && isNum(toks[k + 1])) { // "24 point 5"
        v += Number('0.' + toks[k + 1]);
        k += 2;
      }
      while (k < toks.length && k <= j + 3) { // "38 aur aadha" / "40 and a half"
        if (PLUS_HALF_AFTER.has(toks[k])) adj += 0.5;
        else if (PLUS_QUARTER_WORD.has(toks[k])) adj += 0.25;
        else if (!FILLER.has(toks[k])) break;
        k++;
      }
      values[key] = Math.round((v + adj) * 100) / 100;
      i = j;
      break;
    }
  }
  return { values, unmatched };
}

module.exports = { parse, tokenize };
