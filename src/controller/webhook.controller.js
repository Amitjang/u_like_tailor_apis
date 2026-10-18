// Webhooks: WhatsApp (Meta) delivery status, Razorpay payment.

const crypto = require('crypto');
const { OutboundMessage, SubscriptionPayment } = require('../models');
const { h } = require('../utils/http.helpers');
const billing = require('../utils/billing');

const STATUS_ORDER = ['sending', 'sent', 'delivered', 'read'];

// Meta dashboard verify karta hai
// GET /api/webhooks/whatsapp
const whatsappVerify = (req, res) => {
  const { cfg } = req.app.locals;
  const tok = String(req.query['hub.verify_token'] || '');
  const ok = req.query['hub.mode'] === 'subscribe' && cfg.waVerifyToken && tok.length === cfg.waVerifyToken.length
    && crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(cfg.waVerifyToken));
  if (ok) return res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
  res.status(403).send('forbidden');
};

// sent / delivered / read / failed
// POST /api/webhooks/whatsapp
const whatsappStatus = h(async (req, res) => {
  const { cfg } = req.app.locals;
  const raw = req.rawBody || Buffer.from('');
  if (cfg.waAppSecret) {
    const want = 'sha256=' + crypto.createHmac('sha256', cfg.waAppSecret).update(raw).digest('hex');
    const got = String(req.get('X-Hub-Signature-256') || '');
    if (want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) return res.status(401).send('bad signature');
  } else if (cfg.isProd) {
    return res.status(403).send('webhook secret not configured');
  }
  for (const e of (req.body && req.body.entry) || []) {
    for (const c of e.changes || []) {
      for (const st of (c.value && c.value.statuses) || []) {
        const m = await OutboundMessage.findOne({ providerMessageId: st.id }).lean();
        if (!m) continue;
        const set = { };
        if (st.status === 'failed') {
          set.status = 'failed';
          if (st.errors && st.errors[0]) set.errorMessage = `${st.errors[0].title}: ${st.errors[0].message}`;
        } else if (STATUS_ORDER.indexOf(st.status) > STATUS_ORDER.indexOf(m.status)) { // status peeche nahi jaata
          set.status = st.status;
        }
        if (['delivered', 'read'].includes(st.status) && !m.deliveredAt) set.deliveredAt = new Date();
        if (st.status === 'read') set.readAt = new Date();
        if (Object.keys(set).length) await OutboundMessage.updateOne({ _id: m._id }, { $set: set });
      }
    }
  }
  res.sendStatus(200); // Meta ko hamesha 200, warna retry karta rahega
});

// Razorpay dashboard mein yeh URL + secret.
// Events: payment.captured, order.paid, payment.failed
// POST /api/webhooks/razorpay
const razorpayWebhook = h(async (req, res) => {
  const pay = req.app.locals.pay;
  if (!pay) return res.sendStatus(404);
  if (!pay.verifyWebhook(req.rawBody || Buffer.from(''), req.get('X-Razorpay-Signature'))) return res.status(400).send('bad signature');
  const ev = req.body || {};
  const p = (ev.payload && ev.payload.payment && ev.payload.payment.entity) || {};
  const orderId = p.order_id || (ev.payload && ev.payload.order && ev.payload.order.entity && ev.payload.order.entity.id);
  const row = orderId && (await SubscriptionPayment.findOne({ gateway: 'razorpay', gatewayOrderId: orderId }).lean());
  if (!row) return res.sendStatus(200); // hamara order nahi — retry mat karo
  try {
    if (ev.event === 'payment.captured' || ev.event === 'order.paid') {
      if (p.amount !== row.amountPaise) {
        console.error(JSON.stringify({ level: 'ERROR', msg: 'razorpay amount mismatch', order: orderId, got: p.amount, want: row.amountPaise }));
        return res.sendStatus(200);
      }
      await billing.activate(row._id, { gatewayPaymentId: p.id, method: p.method, raw: ev });
      if (p.method) await SubscriptionPayment.updateOne({ _id: row._id, method: null }, { $set: { method: p.method } });
    } else if (ev.event === 'payment.failed') {
      await billing.markFailed(row._id, p.error_description, ev);
    }
  } catch (e) {
    console.error(JSON.stringify({ level: 'ERROR', msg: 'razorpay webhook', event: ev.event, err: e.message }));
    return res.status(500).send('retry'); // Razorpay dobara bhejega
  }
  res.sendStatus(200);
});

module.exports = {
  whatsappVerify,
  whatsappStatus,
  razorpayWebhook,
};
