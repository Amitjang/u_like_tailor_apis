// Tareekh ke helpers. Sirf-tareekh wale fields (trial, delivery, birthday, attendance, tyohar)
// "YYYY-MM-DD" string ke roop mein save hote hain — timezone ki gadbad nahi, aur string
// compare se hi pehle/baad pata chal jaata hai. "Aaj" hamesha India time (IST) se.
const IST_OFFSET_MS = 330 * 60 * 1000;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// IST ki aaj ki tareekh "2026-10-08"
function todayIST(now = new Date()) {
  return isoDate(new Date(now.getTime() + IST_OFFSET_MS));
}

function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && isoDate(d) === s;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

// Do tareekhon ke beech din (b - a)
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

// IST tareekh + "HH:MM" -> asli Date (UTC)
function istDateTime(dateStr, hhmm = '00:00') {
  return new Date(new Date(`${dateStr}T${hhmm}:00Z`).getTime() - IST_OFFSET_MS);
}

// Date -> IST ki tareekh string
function istDateOf(d) {
  return todayIST(d);
}

// Mahine ki pehli tareekh (IST) "2026-10-01"
function monthStartIST(now = new Date()) {
  return todayIST(now).slice(0, 8) + '01';
}

// 0 = Sunday ... 6 = Saturday
function weekday(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

// "MM-DD" (birthday match ke liye)
function monthDay(dateStr) {
  return dateStr.slice(5, 10);
}

module.exports = { todayIST, isDateStr, addDays, daysBetween, istDateTime, istDateOf, monthStartIST, weekday, monthDay, IST_OFFSET_MS };
