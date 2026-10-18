// Paisa hamesha "paise" (integer) mein: ₹150.50 = 15050.

// Rupees: 125000 -> "1,250", 15050 -> "150.50", 12345678900 -> "12,34,56,789" (Indian grouping)
function rupees(paise) {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  let s = String(r);
  if (s.length > 3) {
    let head = s.slice(0, -3);
    const tail = s.slice(-3);
    const parts = [];
    while (head.length > 2) {
      parts.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) parts.unshift(head);
    s = parts.join(',') + ',' + tail;
  }
  if (p > 0) s += '.' + String(p).padStart(2, '0');
  return (neg ? '-' : '') + s;
}

// GST (18%) keemat ke andar shaamil hai: 29900 -> { taxable: 25339, gst: 4561 }
function gstSplit(amountPaise, ratePct = 18) {
  const taxable = Math.round((amountPaise * 100) / (100 + ratePct));
  return { taxablePaise: taxable, gstPaise: amountPaise - taxable };
}

function isPaise(v) {
  return Number.isSafeInteger(v);
}

module.exports = { rupees, gstSplit, isPaise };
