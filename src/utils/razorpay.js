// Razorpay: Orders API + signature check.
//  1. Server order banata hai (createOrder) -> orderId app ko
//  2. App Razorpay checkout kholta hai (razorpay_flutter), owner UPI/card se pay karta hai
//  3. App ko paymentId + signature milta hai -> server verifyPayment -> plan chalu
//  4. Saath mein webhook bhi aata hai (app band ho jaaye tab bhi plan chalu ho)
const crypto = require('crypto');

function sign(msg, secret) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

function checkHmac(msg, secret, signature) {
  if (!secret || !signature) return false;
  const want = Buffer.from(sign(msg, secret));
  const got = Buffer.from(String(signature).toLowerCase());
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function razorpay({ keyId, keySecret, webhookSecret, baseUrl = 'https://api.razorpay.com' }) {
  baseUrl = baseUrl.replace(/\/+$/, '');
  return {
    keyId,
    // amount paise mein; receipt max 40 characters
    async createOrder(amountPaise, receipt, notes) {
      const res = await fetch(`${baseUrl}/v1/orders`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
        signal: AbortSignal.timeout(15000),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`razorpay create order ${res.status}: ${raw.slice(0, 300)}`);
      const out = JSON.parse(raw);
      if (!out.id) throw new Error('razorpay: unexpected response: ' + raw.slice(0, 300));
      if (out.amount !== amountPaise) throw new Error(`razorpay: amount mismatch ${out.amount} != ${amountPaise}`);
      return out.id;
    },
    // signature = HMAC_SHA256(orderId + "|" + paymentId, keySecret)
    verifyPayment(orderId, paymentId, signature) {
      return checkHmac(`${orderId}|${paymentId}`, keySecret, signature);
    },
    // header X-Razorpay-Signature = HMAC_SHA256(raw body, webhookSecret)
    verifyWebhook(rawBody, signature) {
      return checkHmac(rawBody, webhookSecret, signature);
    },
  };
}

module.exports = { razorpay, sign, checkHmac };
