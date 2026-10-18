// Dukaan ka chalu plan aur uski limits.
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

// Chalu plan (expire ho gaya ho to Free)
async function planOf(shop) {
  const c = await loadPlans();
  const sub = (shop && shop.subscription) || {};
  const live = sub.planId && sub.status === 'active' && (!sub.endsAt || new Date(sub.endsAt) > new Date());
  return (live && c.byId.get(sub.planId)) || c.free || { code: 'free', limits: {} };
}

async function limitsOf(shop) {
  return (await planOf(shop)).limits || {};
}

module.exports = { planOf, limitsOf, clearPlanCache, loadPlans };
