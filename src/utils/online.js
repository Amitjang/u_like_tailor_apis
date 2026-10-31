// Online dukaan: profile, working hours, booking ke niyam aur FREE SLOTS ka hisaab.
// Dukaan ka sab kuch shop.online mein (Mixed) — jo nahi bhara wo DEFAULTS se.
// Saare time India (IST) ke: "2026-11-05" + "12:30".
const { Booking, SlotBlock, Waitlist, ACTIVE_BOOKING } = require('../models');
const { todayIST, addDays, istDateTime, weekday, isDateStr } = require('./dates');
const marketplace = require('./marketplace');

const CATEGORIES = ['gents', 'ladies', 'kids', 'bridal', 'alteration', 'boutique', 'uniform', 'embroidery'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const day = (open, from = '11:00', to = '20:00') => ({ open, from, to });

const DEFAULTS = {
  profile: { enabled: false, about: '', categories: [], services: [], photos: [], homeVisit: false, area: '' },
  hours: {
    days: { 0: day(false), 1: day(true), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(true) },
    breaks: [{ from: '14:00', to: '15:00' }],
    slotMinutes: 30, perSlot: 2, maxPerDay: null, holidays: [], paused: false,
    minLeadMinutes: 60, windowDays: 30, earliestDeliveryDays: 5,
  },
  rules: { autoConfirm: false, advanceType: 'none', advanceValue: 0, freeCancelHours: 4, maxReschedules: 2, responseHours: 2, autoOfferWaitlist: true },
};

const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const partOf = (t) => (mins(t) < 720 ? 'morning' : mins(t) < 1020 ? 'afternoon' : 'evening');

// shop.online -> poori settings (defaults ke saath)
function settingsOf(shop) {
  const o = (shop && shop.online) || {};
  const h = o.hours || {};
  const days = {};
  for (let i = 0; i < 7; i++) days[i] = { ...DEFAULTS.hours.days[i], ...((h.days || {})[i] || {}) };
  return {
    profile: { ...DEFAULTS.profile, ...(o.profile || {}) },
    hours: { ...DEFAULTS.hours, ...h, days, breaks: h.breaks || DEFAULTS.hours.breaks, holidays: h.holidays || [] },
    rules: { ...DEFAULTS.rules, ...(o.rules || {}) },
    rating: o.rating || { avg: 0, count: 0 },
  };
}

// ---------------------------------------------------------------- validation
// Har function {set} ya {error, arg} lautata hai
function validateProfile(b) {
  const p = {};
  if (b.enabled !== undefined) p.enabled = !!b.enabled;
  if (b.about !== undefined) p.about = String(b.about || '').slice(0, 600);
  if (b.area !== undefined) p.area = String(b.area || '').slice(0, 80);
  if (b.homeVisit !== undefined) p.homeVisit = !!b.homeVisit;
  if (b.categories !== undefined) {
    if (!Array.isArray(b.categories) || b.categories.some((c) => !CATEGORIES.includes(c))) return { error: 'invalid_value', arg: 'categories: ' + CATEGORIES.join(', ') };
    p.categories = [...new Set(b.categories)];
  }
  if (b.services !== undefined) {
    if (!Array.isArray(b.services) || b.services.length > 40) return { error: 'invalid_value', arg: 'services (max 40)' };
    p.services = [];
    for (const s of b.services) {
      const name = String((s && s.name) || '').trim().slice(0, 60);
      const from = Number(s && s.fromPaise);
      if (!name || !Number.isSafeInteger(from) || from < 0) return { error: 'invalid_value', arg: 'services: {name, fromPaise}' };
      p.services.push({ name, fromPaise: from, nameHi: s.nameHi ? String(s.nameHi).slice(0, 60) : undefined });
    }
  }
  if (b.photos !== undefined) {
    if (!Array.isArray(b.photos) || b.photos.length > 12 || b.photos.some((u) => !/^https:\/\//.test(String(u)))) return { error: 'invalid_value', arg: 'photos (max 12 https links)' };
    p.photos = b.photos.map(String);
  }
  return { set: p };
}

function validateLocation(b) {
  if (b.location === undefined) return {};
  if (b.location === null) return { geo: null };
  const lat = Number(b.location.lat);
  const lng = Number(b.location.lng);
  if (!(lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98)) return { error: 'location_invalid' }; // India
  return { geo: { type: 'Point', coordinates: [lng, lat] } };
}

function validateHours(b, cur) {
  const h = {};
  if (b.days !== undefined) {
    const days = {};
    for (let i = 0; i < 7; i++) {
      const d = { ...cur.days[i], ...((b.days || {})[i] || {}) };
      if (!HHMM.test(d.from) || !HHMM.test(d.to) || (d.open && mins(d.to) - mins(d.from) < 30)) return { error: 'hours_invalid', arg: String(i) };
      days[i] = { open: !!d.open, from: d.from, to: d.to };
    }
    h.days = days;
  }
  if (b.breaks !== undefined) {
    if (!Array.isArray(b.breaks) || b.breaks.length > 4) return { error: 'hours_invalid', arg: 'breaks' };
    for (const x of b.breaks) if (!x || !HHMM.test(x.from) || !HHMM.test(x.to) || mins(x.to) <= mins(x.from)) return { error: 'hours_invalid', arg: 'breaks' };
    h.breaks = b.breaks.map((x) => ({ from: x.from, to: x.to }));
  }
  const nums = { slotMinutes: [15, 120], perSlot: [1, 20], minLeadMinutes: [0, 1440], windowDays: [1, 90], earliestDeliveryDays: [0, 60] };
  for (const [k, [lo, hi]] of Object.entries(nums)) {
    if (b[k] === undefined) continue;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < lo || n > hi) return { error: 'rule_invalid', arg: `${k} (${lo}-${hi})` };
    h[k] = n;
  }
  if (h.slotMinutes && h.slotMinutes % 15) return { error: 'rule_invalid', arg: 'slotMinutes (15, 30, 45, 60...)' };
  if (b.maxPerDay !== undefined) {
    const n = b.maxPerDay === null ? null : Number(b.maxPerDay);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 500)) return { error: 'rule_invalid', arg: 'maxPerDay (1-500)' };
    h.maxPerDay = n;
  }
  if (b.paused !== undefined) h.paused = !!b.paused;
  if (b.holidays !== undefined) {
    if (!Array.isArray(b.holidays) || b.holidays.length > 366 || b.holidays.some((d) => !isDateStr(d))) return { error: 'date_format', arg: 'holidays' };
    const today = todayIST();
    h.holidays = [...new Set(b.holidays)].filter((d) => d >= today).sort();
  }
  return { set: h };
}

function validateRules(b, admin) {
  const r = {};
  if (b.autoConfirm !== undefined) r.autoConfirm = !!b.autoConfirm;
  if (b.autoOfferWaitlist !== undefined) r.autoOfferWaitlist = !!b.autoOfferWaitlist;
  if (b.advanceType !== undefined) {
    if (!['none', 'fixed', 'pct'].includes(b.advanceType)) return { error: 'invalid_value', arg: 'advanceType: none, fixed, pct' };
    r.advanceType = b.advanceType;
  }
  if (b.advanceValue !== undefined) {
    const n = Number(b.advanceValue);
    if (!Number.isInteger(n) || n < 0) return { error: 'rule_invalid', arg: 'advanceValue' };
    r.advanceValue = n;
  }
  const type = r.advanceType || b.currentAdvanceType;
  if (type === 'pct' && r.advanceValue !== undefined && r.advanceValue > admin.maxAdvancePct) return { error: 'advance_pct_too_high', arg: admin.maxAdvancePct };
  if (b.freeCancelHours !== undefined) {
    const n = Number(b.freeCancelHours);
    if (!Number.isInteger(n) || n < admin.minFreeCancelHours || n > 72) return { error: 'rule_invalid', arg: `freeCancelHours (${admin.minFreeCancelHours}-72)` };
    r.freeCancelHours = n;
  }
  if (b.maxReschedules !== undefined) {
    const n = Number(b.maxReschedules);
    if (!Number.isInteger(n) || n < 0 || n > admin.maxReschedules) return { error: 'rule_invalid', arg: `maxReschedules (0-${admin.maxReschedules})` };
    r.maxReschedules = n;
  }
  if (b.responseHours !== undefined) {
    const n = Number(b.responseHours);
    if (!Number.isInteger(n) || n < 1 || n > 24) return { error: 'rule_invalid', arg: 'responseHours (1-24)' };
    r.responseHours = n;
  }
  return { set: r };
}

// ---------------------------------------------------------------- slots
// Ek din ke saare slot times (break hata ke)
function dayTimes(st, date) {
  const d = st.hours.days[weekday(date)];
  if (!d || !d.open) return [];
  const step = st.hours.slotMinutes;
  const out = [];
  for (let m = mins(d.from); m + step <= mins(d.to); m += step) {
    const inBreak = st.hours.breaks.some((b) => m < mins(b.to) && m + step > mins(b.from));
    if (!inBreak) out.push(hhmm(m));
  }
  return out;
}

// Kai dinon ke slots: [{date, status: free|few|full|closed, reason, slots:[{time, left, booked, blocked, held}]}]
// detail=true: dukaan ke liye bookings bhi saath
async function slotsFor(shop, from, days, { now = new Date(), detail = false, excludeBookingId = null, forUserId = null } = {}) {
  const st = settingsOf(shop);
  const today = todayIST(now);
  const last = addDays(today, st.hours.windowDays);
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(addDays(from, i));
  const [bookings, blocks, holds] = await Promise.all([
    Booking.find({ shopId: shop._id, date: { $in: dates }, status: { $in: ACTIVE_BOOKING }, ...(excludeBookingId && { _id: { $ne: excludeBookingId } }) })
      .select(detail ? 'number date time status customer purpose items fabric advance autoConfirmed' : 'date time').lean(),
    SlotBlock.find({ shopId: shop._id, date: { $in: dates } }).lean(),
    // Waitlist walon ko diya gaya slot (offer chalu) — kisi aur ko nahi milta
    Waitlist.find({ shopId: shop._id, date: { $in: dates }, status: 'offered', 'offer.expiresAt': { $gt: now } }).select('date offer userId').lean(),
  ]);
  const leadUntil = new Date(now.getTime() + st.hours.minLeadMinutes * 60000);
  const out = [];
  for (const date of dates) {
    const times = dayTimes(st, date);
    let reason = null;
    if (date < today) reason = 'past';
    else if (date > last) reason = 'too_far';
    else if (st.hours.paused) reason = 'paused';
    else if (st.hours.holidays.includes(date)) reason = 'holiday';
    else if (!times.length) reason = 'weekly_off';
    const dayBookings = bookings.filter((b) => b.date === date);
    const full = st.hours.maxPerDay && dayBookings.length >= st.hours.maxPerDay;
    const slots = times.map((t) => {
      const booked = dayBookings.filter((b) => b.time === t);
      const blocked = blocks.find((b) => b.date === date && b.time === t);
      const held = holds.filter((w) => w.date === date && w.offer.time === t && w.userId !== forUserId).length;
      const past = istDateTime(date, t) < leadUntil;
      const left = reason || full || blocked || past ? 0 : Math.max(0, st.hours.perSlot - booked.length - held);
      const s = { time: t, left };
      if (detail) Object.assign(s, { booked, blocked: blocked ? { id: blocked._id, note: blocked.note || '' } : null, held, past, capacity: st.hours.perSlot });
      return s;
    });
    const open = slots.filter((s) => s.left > 0);
    const totalLeft = open.reduce((n, s) => n + s.left, 0);
    const capacity = slots.length * st.hours.perSlot;
    let status;
    if (reason) status = 'closed';
    else if (!open.length) status = 'full';
    else if (totalLeft <= Math.max(2, Math.floor(capacity * 0.3))) status = 'few';
    else status = 'free';
    out.push({ date, status, reason: reason || (full ? 'day_limit' : !open.length && slots.length ? 'full' : null), slots: detail || !reason ? slots : [] });
  }
  return out;
}

// Pehla khaali slot (search list ka "Next free")
async function nextFree(shop, { now = new Date(), days = 14 } = {}) {
  const list = await slotsFor(shop, todayIST(now), days, { now });
  for (const d of list) {
    const s = d.slots.find((x) => x.left > 0);
    if (s) return { date: d.date, time: s.time };
  }
  return null;
}

// Is waqt ye slot khaali hai?
async function slotOpen(shop, date, t, opts = {}) {
  if (!isDateStr(date) || !HHMM.test(String(t))) return false;
  const [d] = await slotsFor(shop, date, 1, opts);
  const s = d.slots.find((x) => x.time === t);
  return !!(s && s.left > 0);
}

// Dukaan ke plan ke hisaab se kaun se features chalu
async function featuresFor(shop) {
  const { planOf } = require('./plans');
  const tier = (await planOf(shop)).tier || 'free';
  const cfg = await marketplace.getConfig();
  const on = {};
  for (const [k, f] of Object.entries(cfg.features)) on[k] = !!(f.enabled && f.plans.includes(tier));
  return { tier, features: on, adminRules: cfg.rules, commission: cfg.commission };
}

// Advance kitna (sirf dukaan ke kapde wale booking par)
function advanceFor(rules, fabricPaise, adminRules) {
  if (!fabricPaise || rules.advanceType === 'none') return 0;
  if (rules.advanceType === 'fixed') return Math.min(rules.advanceValue, fabricPaise);
  const pct = Math.min(rules.advanceValue, adminRules.maxAdvancePct);
  return Math.round((fabricPaise * pct) / 100);
}

module.exports = { CATEGORIES, DEFAULTS, settingsOf, validateProfile, validateLocation, validateHours, validateRules, slotsFor, nextFree, slotOpen, featuresFor, advanceFor, dayTimes, partOf, mins, HHMM };
