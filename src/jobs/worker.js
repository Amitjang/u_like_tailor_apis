// ======================= BACKGROUND WORKER =======================
//  1. Sender:    outbound_messages queue se WhatsApp bhejta hai (retry ke saath)
//  2. Scheduler: trial/delivery/udhaar reminders, birthday/anniversary wishes banata hai
//                (har message customer ki bhasha mein — Hindi ya English)
//  3. Hourly:    plan expiry, late orders, low stock aur deadline (2 din / 1 din / aaj) notifications
//                (dukaan ki bhasha mein; Firebase set ho to phone par push bhi — models/message.model.js)
//
// Ek se zyada worker chalaoge to bhi safe:
//  - queue: har message atomic findOneAndUpdate se "claim" hota hai (do worker ek message nahi uthate)
//  - scheduler/hourly: "worker_locks" collection mein lock document (expiry ke saath)
//  - reminders: dedupeKey par unique index — ek reminder do baar nahi banta
// ==================================================================
const os = require('os');
const crypto = require('crypto');
const i18n = require('../utils/i18n');
const { mongoose } = require('../utils/schema.helpers');
const M = require('../models');
const { loadPlans } = require('../utils/plans');
const { enqueue, orderVars } = require('../utils/notify');
const { todayIST, istDateTime, istDateOf, addDays, daysBetween, IST_OFFSET_MS } = require('../utils/dates');
const { rupees } = require('../utils/money');

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STALE_WINDOW = 6 * HOUR; // isse purane reminders skip (worker band raha ho to spam na ho)
const OWNER = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;

const log = (level, msg, extra = {}) => console[level === 'ERROR' ? 'error' : 'log'](JSON.stringify({ level, msg, ...extra }));
const langOf = (s) => i18n.parse(s) || i18n.DEFAULT;

// ---------------- Lock (Postgres advisory lock ki jagah) ----------------
async function withLock(name, ttlMs, fn) {
  const col = mongoose.connection.collection('worker_locks');
  const now = new Date();
  try {
    // Lock khaali/expired ho to hamara; warna duplicate key (koi aur chala raha hai)
    await col.findOneAndUpdate(
      { _id: name, $or: [{ until: { $lt: now } }, { owner: OWNER }] },
      { $set: { owner: OWNER, until: new Date(now.getTime() + ttlMs), at: now } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
  try {
    await fn();
  } finally {
    await col.updateOne({ _id: name, owner: OWNER }, { $set: { until: new Date(0) } }).catch(() => {});
  }
  return true;
}

// ---------------- 1. Sender ----------------
async function sendBatch(wa, { maxAttempts = 3, batch = 20 } = {}) {
  // Crash ke baad "sending" mein atke messages wapas queue mein
  await M.OutboundMessage.updateMany({ status: 'sending', updatedAt: { $lt: new Date(Date.now() - 10 * MIN) } }, { $set: { status: 'queued' } });

  let sent = 0;
  for (let i = 0; i < batch; i++) {
    const m = await M.OutboundMessage.findOneAndUpdate(
      { status: 'queued', scheduledAt: { $lte: new Date() } },
      { $set: { status: 'sending' }, $inc: { attempts: 1 } },
      { sort: { scheduledAt: 1 }, new: true },
    ).lean();
    if (!m) break;
    const p = m.payload || {};
    try {
      const id = await wa.sendTemplate({ to: m.toPhone, templateName: p.templateName || '', lang: m.language || i18n.DEFAULT, params: p.params || [], text: m.renderedBody });
      await M.OutboundMessage.updateOne({ _id: m._id }, { $set: { status: 'sent', sentAt: new Date(), provider: wa.name, providerMessageId: id, errorMessage: null } });
      sent++;
    } catch (e) {
      log('WARN', 'whatsapp send failed', { id: m._id, attempt: m.attempts, err: e.message });
      const set = m.attempts >= maxAttempts
        ? { status: 'failed', errorMessage: e.message }
        : { status: 'queued', errorMessage: e.message, scheduledAt: new Date(Date.now() + m.attempts * 2 * MIN) };
      await M.OutboundMessage.updateOne({ _id: m._id }, { $set: set });
    }
  }
  return sent;
}

// ---------------- 2. Scheduler ----------------
// Sirf un dukaanon ke liye jinke plan mein automation hai aur rule chalu hai.
async function automationShops(now) {
  const plans = await loadPlans();
  const ids = [...plans.byId.values()].filter((p) => p.limits && p.limits.whatsappAutomation).map((p) => p._id);
  if (!ids.length) return [];
  return M.Shop.find({
    deletedAt: null,
    'subscription.planId': { $in: ids },
    'subscription.status': 'active',
    $or: [{ 'subscription.endsAt': null }, { 'subscription.endsAt': { $gt: now } }],
    automationRules: { $elemMatch: { isEnabled: true } },
  }).select('name automationRules').lean();
}

const inWindow = (at, now) => at <= now && at > new Date(now.getTime() - STALE_WINDOW);

// Har chalu rule ke liye "aaj bhejne layak" reminders ki list
async function candidates(shop, now) {
  const out = [];
  const today = todayIST(now);
  for (const rule of shop.automationRules) {
    if (!rule.isEnabled) continue;
    const time = rule.sendTimeLocal || '10:00';
    const off = (rule.offsetMinutes || 0) * MIN;
    // sendAt = tareekh@time + offset  =>  tareekh lagbhag (now - offset) ke aas-paas
    const lo = istDateOf(new Date(now.getTime() - off - STALE_WINDOW - DAY));
    const hi = istDateOf(new Date(now.getTime() - off + DAY));

    if (rule.event === 'trial_reminder' || rule.event === 'delivery_reminder') {
      const field = rule.event === 'trial_reminder' ? 'trialDate' : 'promisedDeliveryDate';
      const notIn = rule.event === 'trial_reminder' ? ['trial', 'ready', 'delivered', 'cancelled'] : ['delivered', 'cancelled'];
      const orders = await M.Order.find({ shopId: shop._id, deletedAt: null, status: { $nin: notIn }, [field]: { $gte: lo, $lte: hi } })
        .select(`customerId ${field}`).lean();
      for (const o of orders) {
        const at = new Date(istDateTime(o[field], time).getTime() + off);
        if (inWindow(at, now)) {
          out.push({ rule, customerId: o.customerId, orderId: o._id, dedupe: `${rule.event === 'trial_reminder' ? 'trial' : 'delivery'}:${o._id}:${o[field]}` });
        }
      }
    } else if (rule.event === 'payment_due') {
      // Udhaar: ready/deliver hone ke baad, har N din, max M baar
      const orders = await M.Order.find({ shopId: shop._id, deletedAt: null, status: { $in: ['ready', 'delivered'] }, balancePaise: { $gt: 0 } })
        .select('customerId deliveredAt history').lean();
      const every = rule.repeatEveryDays || 0;
      const times = every > 0 ? Math.max(rule.maxRepeats || 1, 1) : 1;
      for (const o of orders) {
        let base = o.deliveredAt;
        if (!base) {
          const ready = (o.history || []).filter((x) => !x.itemId && x.toStatus === 'ready').map((x) => new Date(x.at));
          if (ready.length) base = new Date(Math.max(...ready));
        }
        if (!base) continue;
        const baseDate = istDateOf(new Date(base));
        for (let k = 0; k < times; k++) {
          const at = istDateTime(addDays(baseDate, Math.trunc((rule.offsetMinutes || 0) / 1440) + k * every), time);
          if (inWindow(at, now)) out.push({ rule, customerId: o.customerId, orderId: o._id, dedupe: `due:${o._id}:${k}` });
        }
      }
    } else if (rule.event === 'birthday' || rule.event === 'anniversary') {
      const at = istDateTime(today, time);
      if (!inWindow(at, now)) continue;
      const md = today.slice(5);
      const key = rule.event === 'birthday' ? 'dobMD' : 'annMD';
      const customers = await M.Customer.find({ shopId: shop._id, deletedAt: null, [`members.${key}`]: md }).select('members').lean();
      for (const c of customers) {
        for (const m of c.members || []) {
          if (m.deletedAt || m[key] !== md) continue;
          out.push({ rule, customerId: c._id, memberName: m.name, dedupe: `${rule.event}:${m._id}:${today.slice(0, 4)}` });
        }
      }
    }
  }
  return out;
}

async function schedule({ publicBaseUrl, now = new Date() } = {}) {
  let queued = 0;
  for (const shop of await automationShops(now)) {
    const list = await candidates(shop, now);
    if (!list.length) continue;
    // Pehle se bane hue chhod do (har minute dobara vars banane ki zaroorat nahi)
    const done = new Set((await M.OutboundMessage.find({ dedupeKey: { $in: list.map((c) => c.dedupe) } }).select('dedupeKey').lean()).map((m) => m.dedupeKey));
    for (const c of list.slice(0, 500)) {
      if (done.has(c.dedupe)) continue;
      try {
        let vars;
        if (c.orderId) {
          const o = await M.Order.findById(c.orderId).lean();
          if (!o) continue;
          vars = await orderVars(o, publicBaseUrl);
        } else {
          vars = { shop_name: shop.name, customer_name: c.memberName || '' };
        }
        const res = await enqueue({ shopId: shop._id, customerId: c.customerId, orderId: c.orderId, event: c.rule.event, vars, dedupeKey: c.dedupe, fromRule: true });
        if (res.queued) {
          queued++;
          log('INFO', 'reminder queued', { event: c.rule.event, dedupe: c.dedupe, lang: res.language });
        }
      } catch (e) {
        log('ERROR', 'scheduler enqueue', { dedupe: c.dedupe, err: e.message });
      }
    }
  }
  return queued;
}

// ---------------- 3. Hourly ----------------

// Khatam plan -> Free plan par wapas, owner ko notification. Data kuch nahi mitta.
async function expirePlans(now = new Date()) {
  const plans = await loadPlans();
  const free = plans.free;
  if (!free) return 0;
  const shops = await M.Shop.find({ deletedAt: null, 'subscription.status': 'active', 'subscription.endsAt': { $ne: null, $lt: now } })
    .select('defaultLanguage subscription').lean();
  let n = 0;
  for (const s of shops) {
    const old = s.subscription;
    const r = await M.Shop.updateOne(
      { _id: s._id, 'subscription.version': old.version || 0, 'subscription.endsAt': old.endsAt },
      { $set: { subscription: { planId: free._id, planCode: free.code, status: 'active', startsAt: now, endsAt: null, lastPaymentId: null, version: (old.version || 0) + 1 } } },
    );
    if (!r.modifiedCount) continue; // beech mein renew ho gaya
    n++;
    const l = langOf(s.defaultLanguage);
    await M.Notification.create({ shopId: s._id, type: 'plan_expired', title: i18n.t(l, 'notif_plan_expired_title'), body: i18n.t(l, 'notif_plan_expired_body'),
      data: { planCode: old.planCode, endedAt: old.endsAt } });
    log('INFO', 'plan expired -> free', { shop: s._id, plan: old.planCode });
  }
  return n;
}

// Paid plan khatam hone se 3 din pehle aur 1 din pehle yaad dilao (har padaav par ek hi baar)
async function planExpiring(now = new Date()) {
  const plans = await loadPlans();
  const paid = [...plans.byId.values()].filter((p) => p.pricePaise > 0).map((p) => p._id);
  const shops = await M.Shop.find({ deletedAt: null, 'subscription.status': 'active', 'subscription.planId': { $in: paid },
    'subscription.endsAt': { $gt: now, $lte: new Date(now.getTime() + 3 * DAY) } }).select('defaultLanguage subscription').lean();
  let n = 0;
  for (const s of shops) {
    const sub = s.subscription;
    const daysLeft = Math.ceil((new Date(sub.endsAt) - now) / DAY);
    const bucket = daysLeft <= 1 ? 1 : 3;
    const period = `${sub.planId}:${new Date(sub.endsAt).toISOString()}`; // ek plan-avadhi ki pehchaan
    if (await M.Notification.exists({ shopId: s._id, type: 'plan_expiring', 'data.period': period, 'data.bucket': bucket })) continue;
    const l = langOf(s.defaultLanguage);
    await M.Notification.create({ shopId: s._id, type: 'plan_expiring', title: i18n.t(l, 'notif_plan_expiring_title', daysLeft),
      body: i18n.t(l, 'notif_plan_expiring_body'), data: { period, bucket, daysLeft, planCode: sub.planCode } });
    n++;
  }
  return n;
}

// Subah 9 baje (IST) ke baad din mein ek baar: late orders ki notification
async function lateOrders(now = new Date()) {
  const hourIST = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  if (hourIST < 9) return 0;
  const today = todayIST(now);
  const rows = await M.Order.aggregate([
    { $match: { deletedAt: null, status: { $nin: ['ready', 'delivered', 'cancelled'] }, promisedDeliveryDate: { $lt: today } } },
    { $group: { _id: '$shopId', n: { $sum: 1 } } },
  ]);
  const since = istDateTime(today);
  let made = 0;
  for (const r of rows) {
    if (await M.Notification.exists({ shopId: r._id, type: 'orders_late', createdAt: { $gte: since } })) continue;
    const shop = await M.Shop.findOne({ _id: r._id, deletedAt: null }).select('defaultLanguage').lean();
    if (!shop) continue;
    const l = langOf(shop.defaultLanguage);
    await M.Notification.create({ shopId: r._id, type: 'orders_late', title: i18n.t(l, 'notif_late_title', r.n), body: i18n.t(l, 'notif_late_body'), data: { count: r.n } });
    made++;
  }
  return made;
}

// Deadline yaad dilana (dukaan ke logon ko, subah 8 baje ke baad):
//   delivery: 2 din pehle, 1 din pehle, aur AAJ (aaj wali alag type/channel — phone par alag dikhti hai)
//   trial:    1 din pehle aur aaj
// Har order + tareekh + padaav par sirf ek baar (tareekh badli to naye sire se).
const DEADLINE_HOUR_IST = 8;
async function deadlineReminders(now = new Date()) {
  const hourIST = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  if (hourIST < DEADLINE_HOUR_IST) return 0;
  const today = todayIST(now);
  const d1 = addDays(today, 1);
  const d2 = addDays(today, 2);

  const [deliveries, trials] = await Promise.all([
    M.Order.find({ deletedAt: null, status: { $nin: ['delivered', 'cancelled'] }, promisedDeliveryDate: { $in: [today, d1, d2] } })
      .select('shopId customerId orderNumber promisedDeliveryDate status balancePaise').lean(),
    M.Order.find({ deletedAt: null, status: { $in: ['received', 'cutting', 'stitching'] }, trialDate: { $in: [today, d1] } })
      .select('shopId customerId orderNumber trialDate status').lean(),
  ]);
  const jobs = [
    ...deliveries.map((o) => ({ o, kind: 'deadline', date: o.promisedDeliveryDate })),
    ...trials.map((o) => ({ o, kind: 'trial', date: o.trialDate })),
  ];
  if (!jobs.length) return 0;

  const shopIds = [...new Set(jobs.map((j) => j.o.shopId))];
  const custIds = [...new Set(jobs.map((j) => j.o.customerId))];
  const [shops, customers] = await Promise.all([
    M.Shop.find({ _id: { $in: shopIds }, deletedAt: null }).select('defaultLanguage').lean(),
    M.Customer.find({ _id: { $in: custIds } }).select('name').lean(),
  ]);
  const shopLang = new Map(shops.map((s) => [s._id, langOf(s.defaultLanguage)]));
  const custName = new Map(customers.map((c) => [c._id, c.name]));

  let made = 0;
  for (const { o, kind, date } of jobs) {
    const l = shopLang.get(o.shopId);
    if (!l) continue; // dukaan delete
    const daysLeft = daysBetween(today, date);
    const type = kind === 'deadline' ? (daysLeft === 0 ? 'deadline_today' : 'deadline_soon') : (daysLeft === 0 ? 'trial_today' : 'trial_soon');
    if (await M.Notification.exists({ shopId: o.shopId, 'data.orderId': o._id, type, 'data.date': date, 'data.daysLeft': daysLeft })) continue;

    const no = o.orderNumber || '-';
    const name = custName.get(o.customerId) || '';
    const status = i18n.t(l, 'status_' + o.status);
    let title;
    let body;
    if (kind === 'deadline') {
      title = daysLeft === 0 ? i18n.t(l, 'notif_deadline_today_title', no, name)
        : i18n.t(l, daysLeft === 1 ? 'notif_deadline_1_title' : 'notif_deadline_2_title', no, name);
      body = daysLeft === 0 ? i18n.t(l, 'notif_deadline_today_body', status) : i18n.t(l, 'notif_deadline_soon_body', date, status);
      if (o.balancePaise > 0) body += i18n.t(l, 'notif_balance_due', rupees(o.balancePaise));
    } else {
      title = i18n.t(l, daysLeft === 0 ? 'notif_trial_today_title' : 'notif_trial_1_title', no, name);
      body = i18n.t(l, 'notif_trial_body', date, status);
    }
    try {
      await M.Notification.create({ shopId: o.shopId, type, title, body,
        data: { orderId: o._id, orderNumber: o.orderNumber, customerId: o.customerId, date, daysLeft, kind } });
      made++;
    } catch (e) {
      log('ERROR', 'deadline notification', { err: e.message, order: o._id });
    }
  }
  return made;
}

// Low stock fabric (har fabric ke liye ek baar — jab tak padhi na jaaye / 3 din)
async function lowStock(now = new Date()) {
  const fabrics = await M.Fabric.find({ deletedAt: null, $expr: { $lte: ['$stockQty', '$lowStockThreshold'] } }).select('shopId name stockQty unit').lean();
  let made = 0;
  for (const f of fabrics) {
    const recent = await M.Notification.exists({ shopId: f.shopId, type: 'low_stock', 'data.fabricId': f._id,
      $or: [{ readAt: null }, { createdAt: { $gt: new Date(now.getTime() - 3 * DAY) } }] });
    if (recent) continue;
    const shop = await M.Shop.findOne({ _id: f.shopId, deletedAt: null }).select('defaultLanguage').lean();
    if (!shop) continue;
    const l = langOf(shop.defaultLanguage);
    const qty = String(Math.round(f.stockQty * 100) / 100);
    await M.Notification.create({ shopId: f.shopId, type: 'low_stock', title: i18n.t(l, 'notif_low_stock_title', f.name),
      body: i18n.t(l, 'notif_low_stock_body', qty, i18n.t(l, 'unit_' + f.unit)), data: { fabricId: f._id } });
    made++;
  }
  return made;
}

async function hourly(now = new Date()) {
  const out = {};
  for (const [k, fn] of Object.entries({ expirePlans, planExpiring, lateOrders, lowStock, deadlineReminders })) {
    try {
      out[k] = await fn(now);
    } catch (e) {
      log('ERROR', 'hourly ' + k, { err: e.message });
    }
  }
  return out;
}

// ---------------- Runner ----------------
// start({ wa, publicBaseUrl }) -> stop()
function start({ wa, publicBaseUrl, maxAttempts = 3 }) {
  let stopped = false;
  let busy = Promise.resolve();
  const run = (name, fn) => {
    // Ek waqt mein ek hi kaam (taaki ek hi process mein dohra na chale)
    busy = busy.then(async () => {
      if (stopped) return;
      try {
        await fn();
      } catch (e) {
        log('ERROR', 'worker ' + name, { err: e.message });
      }
    });
    return busy;
  };
  const doSchedule = () => run('schedule', () => withLock('scheduler', 5 * MIN, () => schedule({ publicBaseUrl })));
  const doHourly = () => run('hourly', () => withLock('hourly', 30 * MIN, () => hourly()));
  const doSend = () => run('send', () => sendBatch(wa, { maxAttempts }));

  doSchedule();
  doHourly();
  const timers = [setInterval(doSend, 5000), setInterval(doSchedule, MIN), setInterval(doHourly, HOUR)];
  log('INFO', 'worker started', { provider: wa.name });
  return async function stop() {
    stopped = true;
    timers.forEach(clearInterval);
    await busy;
    log('INFO', 'worker stopped');
  };
}

module.exports = { start, sendBatch, schedule, hourly, expirePlans, planExpiring, lateOrders, lowStock, deadlineReminders, withLock, candidates };
