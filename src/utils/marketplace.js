// Marketplace (customer app) ki settings — admin panel se badalti hain, server par ek document.
// Jo value admin ne nahi badli, wo yahan ke DEFAULTS se aati hai.
const { MarketplaceConfig } = require('../models');

const TIERS = ['free', 'growth', 'pro'];

// key -> [label, default on?, default plans]
const FEATURES = {
  instantBooking: ['Instant booking & auto-confirm', true, TIERS],
  selfService: ['Reschedule / cancel / book again', true, TIERS],
  advance: ['Advance on fabric orders', true, TIERS],
  waitlist: ['Waitlist', true, TIERS],
  whatsappReminders: ['WhatsApp reminders', true, ['growth', 'pro']],
  deals: ['Deals & last-minute offers', false, ['growth', 'pro']],
  loyalty: ['Loyalty card & packages', false, ['pro']],
  giftCards: ['Gift cards', false, ['pro']],
  offerMessages: ['Offer messages to customers', false, ['pro']],
};

const DEFAULTS = {
  commission: { enabled: false, stitchingPct: 8, fabricPct: 3, newCustomersOnly: true, proZero: true, startsAt: null },
  rules: { maxAdvancePct: 25, minFreeCancelHours: 2, waitlistOfferMinutes: 30, maxReschedules: 2, offerMessagesPerMonth: 500 },
};
const RULE_LIMITS = {
  maxAdvancePct: [0, 100], minFreeCancelHours: [0, 72], waitlistOfferMinutes: [5, 240], maxReschedules: [0, 10], offerMessagesPerMonth: [0, 100000],
};

function defaultFeatures() {
  const out = {};
  for (const [k, [, on, plans]] of Object.entries(FEATURES)) out[k] = { enabled: on, plans: [...plans] };
  return out;
}

function merge(doc) {
  const d = doc || {};
  const features = defaultFeatures();
  for (const k of Object.keys(features)) if (d.features && d.features[k]) features[k] = { ...features[k], ...d.features[k] };
  return {
    commission: { ...DEFAULTS.commission, ...(d.commission || {}) },
    features,
    rules: { ...DEFAULTS.rules, ...(d.rules || {}) },
    featureLabels: Object.fromEntries(Object.entries(FEATURES).map(([k, [label]]) => [k, label])),
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || null,
  };
}

async function getConfig() {
  return merge(await MarketplaceConfig.findById('main').lean());
}

// Kya ye feature is plan (tier) ki dukaan ke liye chalu hai?
async function featureOn(key, tier) {
  const f = (await getConfig()).features[key];
  return !!(f && f.enabled && f.plans.includes(tier || 'free'));
}

// Admin ki bheji value ko jaancho; galat ho to error key (string) lautao
function validate(b) {
  const set = {};
  if (b.commission !== undefined) {
    const c = b.commission || {};
    for (const k of ['stitchingPct', 'fabricPct']) {
      if (c[k] === undefined) continue;
      const n = Number(c[k]);
      if (!(n >= 0 && n <= 50)) return { error: 'commission_pct_invalid' };
      set[`commission.${k}`] = n;
    }
    for (const k of ['enabled', 'newCustomersOnly', 'proZero']) if (c[k] !== undefined) set[`commission.${k}`] = !!c[k];
    if (c.startsAt !== undefined) {
      if (c.startsAt !== null && Number.isNaN(Date.parse(c.startsAt))) return { error: 'date_format', arg: 'commission.startsAt' };
      set['commission.startsAt'] = c.startsAt ? new Date(c.startsAt) : null;
    }
    // Pehli baar on karte waqt shuru ki tareekh na di ho to aaj se
    if (c.enabled === true && c.startsAt === undefined) set['commission.startsAt'] = new Date();
  }
  if (b.features !== undefined) {
    for (const [k, v] of Object.entries(b.features || {})) {
      if (!FEATURES[k]) return { error: 'feature_unknown', arg: k };
      if (v.enabled !== undefined) set[`features.${k}.enabled`] = !!v.enabled;
      if (v.plans !== undefined) {
        if (!Array.isArray(v.plans) || v.plans.some((p) => !TIERS.includes(p))) return { error: 'feature_plans_invalid' };
        set[`features.${k}.plans`] = TIERS.filter((t) => v.plans.includes(t));
      }
    }
  }
  if (b.rules !== undefined) {
    for (const [k, v] of Object.entries(b.rules || {})) {
      if (!RULE_LIMITS[k]) return { error: 'rule_unknown', arg: k };
      const n = Number(v);
      const [lo, hi] = RULE_LIMITS[k];
      if (!Number.isInteger(n) || n < lo || n > hi) return { error: 'rule_invalid', arg: `${k} (${lo}-${hi})` };
      set[`rules.${k}`] = n;
    }
  }
  return { set };
}

async function updateConfig(body, by) {
  const v = validate(body);
  if (v.error) return v;
  if (!Object.keys(v.set).length) return { error: 'no_fields', arg: 'commission, features, rules' };
  // Adhoori value (sirf enabled) bhi theek — baaki merge() default se bharta hai
  await MarketplaceConfig.updateOne({ _id: 'main' }, { $set: { ...v.set, updatedBy: by } }, { upsert: true });
  return { config: await getConfig() };
}

// Apps ke liye (bina login): sirf kaam ki baatein
async function publicConfig() {
  const c = await getConfig();
  return { commissionEnabled: c.commission.enabled, features: c.features, rules: c.rules };
}

module.exports = { FEATURES, TIERS, DEFAULTS, getConfig, featureOn, validate, updateConfig, publicConfig };
