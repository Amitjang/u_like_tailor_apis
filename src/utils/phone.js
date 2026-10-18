// Har format ko +91XXXXXXXXXX bana deta hai.
// "98765 43210", "+91-9876543210", "09876543210", "919876543210" sab chalenge. Galat ho to null.
function normalizePhone(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  let d = raw.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d[0] === '0') d = '91' + d.slice(1);
  else if (d.length === 12 && d.startsWith('91')) {
    // ok
  } else {
    // Doosre desh: + ke saath 8 se 15 digits
    if (raw.startsWith('+') && d.length >= 8 && d.length <= 15) return '+' + d;
    return null;
  }
  if (d[2] < '6') return null; // Indian mobile 6,7,8,9 se shuru hote hain
  return '+' + d;
}

module.exports = { normalizePhone };
