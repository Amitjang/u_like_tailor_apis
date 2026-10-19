// Staff ki permissions: maalik har staff ke liye tay karta hai app mein kya dikhe / kya kar sake.
//  • owner  — sab kuch (hamesha)
//  • manager — sab kuch (plan kharidna, team aur staff login sirf owner)
//  • staff  — neeche ki list; maalik ne jo chuna (na chuna ho to "default")
// Server har API par yahi check karta hai — app sirf screen chhupati hai.
const i18n = require('./i18n');

// key -> [default staff ke liye, group]
const CATALOG = [
  ['orders_view', true, 'orders'],
  ['orders_create', true, 'orders'],
  ['orders_edit', true, 'orders'],
  ['customers_view', true, 'customers'],
  ['customers_edit', true, 'customers'],
  ['measurements', true, 'customers'],
  ['payments', false, 'money'],
  ['dashboard_money', false, 'money'],
  ['expenses', false, 'money'],
  ['reports', false, 'money'],
  ['workers', false, 'shop'],
  ['fabrics', false, 'shop'],
  ['festivals', true, 'shop'],
  ['whatsapp', false, 'shop'],
  ['settings', false, 'shop'],
];
const KEYS = CATALOG.map((c) => c[0]);
const DEFAULTS = Object.fromEntries(CATALOG.map(([k, d]) => [k, d]));

// member (shop.members ka ek) -> { key: true/false } (har key)
function effective(member) {
  if (!member) return Object.fromEntries(KEYS.map((k) => [k, false]));
  if (member.role === 'owner' || member.role === 'manager') return Object.fromEntries(KEYS.map((k) => [k, true]));
  const p = member.permissions || {};
  return Object.fromEntries(KEYS.map((k) => [k, typeof p[k] === 'boolean' ? p[k] : DEFAULTS[k]]));
}

// App se aayi permissions: sirf jaani-pehchani keys, sirf true/false
function sanitize(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of KEYS) if (typeof input[k] === 'boolean') out[k] = input[k];
  return out;
}

// Permission screen ke liye list (bhasha mein)
function catalog(lang) {
  return CATALOG.map(([key, def, group]) => ({
    key, group, default: def,
    label: i18n.t(lang, 'perm_' + key),
    description: i18n.t(lang, 'perm_' + key + '_desc'),
    groupLabel: i18n.t(lang, 'perm_group_' + group),
  }));
}

module.exports = { KEYS, DEFAULTS, CATALOG, effective, sanitize, catalog };
