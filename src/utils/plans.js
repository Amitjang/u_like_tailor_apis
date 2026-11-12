// Dukaan ka chalu plan aur uski limits.
//
// ===== PAYMENT ABHI BAND (launch offer) =====
// .env / Render mein BILLING_ENABLED=true NAHI hai  ->  har dukaan ko Pro ki saari suvidhayein MUFT
// (unlimited customer / order / staff, team login, WhatsApp automation, reports, GST bill...).
// Plan kharidna (Razorpay) band rehta hai. Payment shuru karni ho: Render mein BILLING_ENABLED=true
// + app mein AppFeatures.billingEnabled = true (agli update). Purana plan / payment code sab yahin hai.
const { Plan } = require('../models');

let cache = { at: 0, byId: new Map(), free: null };

async function loadPlans() {
  if (Date.now() - cache.at < 30000) return cache;
  const all = await Plan.find().lean();
  cache = { at: Date.now(), byId: new Map(all.map((p) => [p._id, p])), free: all.find((p) => p.code === 'free') || null };
  return cache;
}

function clearPlanCache() {
  cache.at = 0;
}

// Payment chalu hai? (default: NAHI — abhi sab free)
function billingEnabled() {
  return String(process.env.BILLING_ENABLED || '').trim().toLowerCase() === 'true';
}

// Payment band ho tab sabka plan: Pro jaisa, sab unlimited, kuch paisa nahi
function launchPlan(c) {
  const pro = [...c.byId.values()].filter((p) => p.tier === 'pro').sort((a, b) => b.pricePaise - a.pricePaise)[0];
  const limits = { ...((pro && pro.limits) || {}) };
  for (const [k, v] of Object.entries(limits)) if (typeof v === 'boolean') limits[k] = true;
  Object.assign(limits, {
    maxCustomers: null, maxOrdersPerMonth: null, maxStaff: null,
    whatsappAutomation: true, reports: true, voiceInput: true, gstInvoice: true, multiUser: true,
  });
  return {
    _id: (pro && pro._id) || 'launch_free', code: 'launch_free', tier: 'pro',
    name: 'Free — all features', nameHi: 'मुफ़्त — सारी सुविधाएँ',
    description: 'All features are free for now', descriptionHi: 'अभी सारी सुविधाएँ मुफ़्त हैं',
    pricePaise: 0, billingPeriod: 'lifetime', limits, launchFree: true,
  };
}

// Chalu plan (expire ho gaya ho to Free). Payment band = sabko launchPlan.
async function planOf(shop) {
  const c = await loadPlans();
  if (!billingEnabled()) return launchPlan(c);
  const sub = (shop && shop.subscription) || {};
  const live = sub.planId && sub.status === 'active' && (!sub.endsAt || new Date(sub.endsAt) > new Date());
  return (live && c.byId.get(sub.planId)) || c.free || { code: 'free', limits: {} };
}

async function limitsOf(shop) {
  return (await planOf(shop)).limits || {};
}

module.exports = { planOf, limitsOf, clearPlanCache, loadPlans, billingEnabled };
