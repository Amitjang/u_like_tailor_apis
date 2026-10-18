// Subscription: plan kharidna, renew, upgrade/downgrade aur plan chalu karna.
//
// MongoDB mein bina multi-document transaction ke surakshit:
//   1. Payment ko atomically "paid" claim karo (status created/failed -> paid). Do baar
//      (app verify + webhook) aaye to bhi sirf ek hi jeetta hai.
//   2. Dukaan ka plan "version" check ke saath badlo; beech mein kisi aur ne badla ho to
//      dobara hisaab lagao (optimistic locking).
//   3. Agar step 1 ke baad server ruk gaya, agli baar (webhook retry) ensureApplied() plan laga deta hai.
const i18n = require('./i18n');
const { nextSeq } = require('./schema.helpers');
const { Plan, Shop, SubscriptionPayment, Notification } = require('../models');
const { loadPlans, clearPlanCache } = require('./plans');
const { notFound, bad } = require('./http.helpers');

const DAY = 86400000;
const MAX_CARRY_MS = 5 * 365 * DAY;
const TIER_RANK = { free: 0, growth: 1, pro: 2 };

// start + plan ki avadhi; lifetime = null (kabhi khatam nahi)
function addPeriod(d, period) {
  const x = new Date(d);
  if (period === 'monthly') x.setUTCMonth(x.getUTCMonth() + 1);
  else if (period === 'quarterly') x.setUTCMonth(x.getUTCMonth() + 3);
  else if (period === 'yearly') x.setUTCFullYear(x.getUTCFullYear() + 1);
  else return null;
  return x;
}

// Kharidne layak plan (active, paid)
async function planByCode(code) {
  const p = await Plan.findOne({ code }).lean();
  if (!p) throw notFound('plan_not_found');
  if (!p.isActive || !(p.pricePaise > 0)) throw bad('plan_not_purchasable');
  return p;
}

// Dukaan ka chalu subscription (plan ke saath)
async function currentOf(shop) {
  const s = shop.subscription || {};
  if (!s.planId) return null;
  const { byId } = await loadPlans();
  const plan = byId.get(s.planId);
  if (!plan) return null;
  return { plan, status: s.status, startsAt: s.startsAt, endsAt: s.endsAt, version: s.version || 0 };
}

// Preview: plan kharidne par kya hoga.
//   new      = abhi Free / purana plan khatam -> aaj se
//   renew    = wahi plan -> purani end date ke baad jud jaata hai
//   upgrade / downgrade / switch (wahi tier, monthly <-> yearly)
// Plan badalne par purane plan ke bache dino ki keemat naye plan ke dino mein badal kar jud jaati hai.
function compute(now, cur, plan) {
  const pv = { kind: 'new', fromPlan: null, toPlan: plan.code, amountPaise: plan.pricePaise, startsAt: now, endsAt: null, carriedOverDays: 0 };
  const paidActive = cur && cur.plan.pricePaise > 0 && cur.endsAt && new Date(cur.endsAt) > now && cur.status === 'active';
  if (!paidActive) {
    pv.endsAt = addPeriod(now, plan.billingPeriod);
    return pv;
  }
  pv.fromPlan = cur.plan.code;
  if (cur.plan._id === plan._id) {
    pv.kind = 'renew';
    pv.startsAt = cur.startsAt;
    pv.endsAt = addPeriod(cur.endsAt, plan.billingPeriod);
    return pv;
  }
  let newEnd = addPeriod(now, plan.billingPeriod);
  const curEnd = addPeriod(now, cur.plan.billingPeriod);
  if (newEnd && curEnd) {
    const remaining = new Date(cur.endsAt) - now;
    const credit = (remaining * cur.plan.pricePaise) / (curEnd - now); // paise
    let extra = (credit / plan.pricePaise) * (newEnd - now);
    extra = Math.min(extra, MAX_CARRY_MS);
    newEnd = new Date(newEnd.getTime() + extra);
    pv.carriedOverDays = Math.round(extra / DAY);
  }
  pv.endsAt = newEnd;
  const from = TIER_RANK[cur.plan.tier];
  const to = TIER_RANK[plan.tier];
  if (from !== undefined && to !== undefined && to > from) pv.kind = 'upgrade';
  else if (from !== undefined && to !== undefined && to < from) pv.kind = 'downgrade';
  else if (cur.plan.tier === plan.tier) pv.kind = 'switch';
  else pv.kind = 'upgrade';
  return pv;
}

function previewMessage(lang, pv) {
  const end = pv.endsAt ? i18n.dateLong(lang, pv.endsAt) : i18n.t(lang, 'plan_no_expiry');
  if (pv.kind === 'renew') return i18n.t(lang, 'preview_renew', end);
  if (pv.kind !== 'new' && pv.carriedOverDays > 0) return i18n.t(lang, 'preview_change', pv.carriedOverDays, end);
  return i18n.t(lang, 'preview_new', end);
}

function result(pay, alreadyPaid, kind) {
  return { subscriptionPaymentId: pay._id, planCode: pay.planCode, kind: kind || null, endsAt: pay.periodEnd || null, receiptNumber: pay.receiptNumber || null, alreadyPaid };
}

// Pehle claim ho chuka payment: agar dukaan par lagna reh gaya ho (server beech mein ruka) to laga do
async function ensureApplied(pay) {
  const shop = await Shop.findById(pay.shopId).lean();
  if (!shop || (shop.subscription && shop.subscription.lastPaymentId === pay._id)) return;
  const later = await SubscriptionPayment.exists({ shopId: pay.shopId, status: 'paid', paidAt: { $gt: pay.paidAt } });
  if (later || !pay.periodEnd) return;
  const v = (shop.subscription && shop.subscription.version) || 0;
  await Shop.updateOne({ _id: shop._id, 'subscription.version': v }, {
    $set: { subscription: { planId: pay.planId, planCode: pay.planCode, status: 'active', startsAt: pay.periodStart, endsAt: pay.periodEnd, lastPaymentId: pay._id, version: v + 1 } },
  });
}

// Payment "paid" karo aur plan chalu karo. Idempotent.
async function activate(paymentId, { gatewayPaymentId, method, raw } = {}) {
  let pay = await SubscriptionPayment.findById(paymentId).lean();
  if (!pay) throw notFound('payment_not_found');
  if (pay.status === 'paid') {
    await ensureApplied(pay);
    return result(pay, true);
  }
  if (pay.status === 'refunded') throw bad('payment_not_found');
  const plan = await Plan.findById(pay.planId).lean();
  if (!plan) throw notFound('plan_not_found');

  let claimed = false;
  let pv;
  for (let attempt = 0; attempt < 8; attempt++) {
    const shop = await Shop.findById(pay.shopId).lean();
    if (!shop) throw notFound();
    const cur = await currentOf(shop);
    const version = (shop.subscription && shop.subscription.version) || 0;
    pv = compute(new Date(), cur, plan);
    const period = { periodStart: pv.startsAt, periodEnd: pv.endsAt };

    if (!claimed) {
      const receipt = 'ULT-' + new Date().getUTCFullYear() + '-' + String(await nextSeq('subscription_receipt')).padStart(6, '0');
      const set = { status: 'paid', paidAt: new Date(), failureReason: null, receiptNumber: receipt, ...period };
      if (gatewayPaymentId) set.gatewayPaymentId = gatewayPaymentId;
      if (method) set.method = method;
      if (raw) set.raw = raw;
      const won = await SubscriptionPayment.findOneAndUpdate(
        { _id: paymentId, status: { $in: ['created', 'failed'] } }, { $set: set }, { new: true },
      ).lean();
      if (!won) { // doosre request ne pehle claim kar liya
        pay = await SubscriptionPayment.findById(paymentId).lean();
        await ensureApplied(pay);
        return result(pay, true);
      }
      pay = won;
      claimed = true;
    } else {
      pay = await SubscriptionPayment.findByIdAndUpdate(paymentId, { $set: period }, { new: true }).lean();
    }

    const sub = { planId: plan._id, planCode: plan.code, status: 'active', startsAt: pv.startsAt, endsAt: pv.endsAt, lastPaymentId: pay._id, version: version + 1 };
    const filter = version === 0 && !(shop.subscription && shop.subscription.version)
      ? { _id: shop._id, $or: [{ 'subscription.version': 0 }, { 'subscription.version': { $exists: false } }] }
      : { _id: shop._id, 'subscription.version': version };
    const r = await Shop.updateOne(filter, { $set: { subscription: sub } });
    if (r.modifiedCount === 1) {
      await notifyActivated(shop, plan, pv, pay.receiptNumber);
      clearPlanCache();
      return result(pay, false, pv.kind);
    }
  }
  throw new Error('subscription update conflict');
}

async function notifyActivated(shop, plan, pv, receipt) {
  const lang = i18n.parse(shop.defaultLanguage) || i18n.DEFAULT;
  const name = i18n.pick(lang, plan.name, plan.nameHi);
  const body = pv.endsAt ? i18n.t(lang, 'plan_valid_till', i18n.dateLong(lang, pv.endsAt)) : i18n.t(lang, 'plan_no_expiry');
  await Notification.create({ shopId: shop._id, type: 'plan_activated', title: i18n.t(lang, 'notif_plan_activated_title', name), body, data: { plan: plan.code, receipt } });
}

// Payment fail (sirf 'created' ko; usi order par baad mein success aaye to activate phir bhi chalega)
async function markFailed(paymentId, reason, raw) {
  await SubscriptionPayment.updateOne({ _id: paymentId, status: 'created' }, { $set: { status: 'failed', failureReason: reason || null, raw } });
}

module.exports = { addPeriod, planByCode, currentOf, compute, previewMessage, activate, ensureApplied, markFailed };
