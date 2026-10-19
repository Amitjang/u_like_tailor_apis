// Bina login wale routes: bhashayein, plans (pricing), customer tracking page, public catalog.

const i18n = require('../utils/i18n');
const { Plan, Order, Customer, Shop, Design, Media, GarmentType, AppConfig } = require('../models');
const appConfig = require('../utils/app_config');
const { h, ok, notFound } = require('../utils/http.helpers');
const { upiUri } = require('./orders.controller');
const { garmentName } = require('../utils/orders');

const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const PERIOD_LABEL = { monthly: 'period_monthly', quarterly: 'period_quarterly', yearly: 'period_yearly', lifetime: 'period_lifetime' };

// App khulte hi: force update chahiye? privacy / terms links.
// Query: ?platform=android|ios&version=1.0.0
// GET /api/public/app-config
const getAppConfig = h(async (req, res) => {
  const doc = await AppConfig.findById('main').lean();
  ok(res, appConfig.forApp(doc, { platform: String(req.query.platform || 'android'), version: String(req.query.version || ''), lang: req.lang }));
});

// bhasha chunne wali screen
// GET /api/public/languages
const getLanguages = (req, res) => ok(res, {
  default: 'hi',
  languages: [{ code: 'hi', name: 'हिन्दी', englishName: 'Hindi' }, { code: 'en', name: 'English', englishName: 'English' }],
});

// pricing screen (bhasha mein; keemat GST ke saath)
// pricePerMonthPaise aur savingsPaise (saalana par bachat) app seedha dikha sakta hai
// GET /api/public/plans
const getPlans = h(async (req, res) => {
  const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  ok(res, plans.map((p) => {
    const months = MONTHS[p.billingPeriod];
    const monthly = plans.find((x) => x.tier === p.tier && x.billingPeriod === 'monthly');
    return {
      ...p,
      displayName: i18n.pick(req.lang, p.name, p.nameHi),
      displayDescription: i18n.pick(req.lang, p.description, p.descriptionHi),
      periodLabel: i18n.t(req.lang, PERIOD_LABEL[p.billingPeriod]),
      pricePerMonthPaise: months ? Math.round(p.pricePaise / months) : null,
      savingsPaise: months && monthly ? Math.max(monthly.pricePaise * months - p.pricePaise, 0) : 0,
      priceIncludesGst: true,
    };
  }));
});

// Query: ?lang=en — customer bina app ke apna order dekhta hai.
// Bhasha: ?lang / X-Language, warna customer ki apni. Phone ya naap yahan nahi dikhta.
// GET /api/public/track/:token
const trackOrder = h(async (req, res) => {
  const token = req.params.token;
  if (token.length < 12 || token.length > 64) throw notFound('order_not_found');
  const o = await Order.findOne({ trackingToken: token, deletedAt: null }).lean();
  if (!o) throw notFound('order_not_found');
  const [c, shop] = await Promise.all([Customer.findById(o.customerId).lean(), Shop.findById(o.shopId).lean()]);
  const lang = req.langExplicit || i18n.parse(c && c.preferredLanguage) || i18n.parse(shop.defaultLanguage) || i18n.DEFAULT;
  res.set('Content-Language', lang);
  const label = (s) => i18n.t(lang, 'status_' + s);
  const out = {
    language: lang,
    shop: { name: shop.name, phone: shop.phone, whatsappPhone: shop.whatsappPhone, address: shop.address, city: shop.city, logoUrl: shop.logoUrl },
    orderNumber: o.orderNumber,
    customerFirstName: c ? c.name.split(' ')[0] : '',
    status: o.status,
    statusLabel: label(o.status),
    orderDate: o.orderDate, trialDate: o.trialDate, promisedDeliveryDate: o.promisedDeliveryDate, deliveredAt: o.deliveredAt,
    totalPaise: o.totalPaise, paidPaise: o.paidPaise, balancePaise: o.balancePaise,
    items: o.items.filter((i) => !i.deletedAt && i.status !== 'cancelled')
      .map((i) => ({ garment: garmentName(lang, i), quantity: i.quantity, status: i.status, statusLabel: label(i.status), for: i.memberName })),
    timeline: (o.history || []).filter((x) => !x.itemId).map((x) => ({ status: x.toStatus, statusLabel: label(x.toStatus), at: x.at })),
  };
  if (o.balancePaise > 0 && shop.upiId) {
    out.upiPayLink = upiUri(shop.upiId, shop.name, o.balancePaise, o.orderNumber ? `Order ${o.orderNumber}` : 'Order');
  }
  res.set('Cache-Control', 'no-store');
  ok(res, out);
});

// dukaan ke public designs
// GET /api/public/shops/:shopId/catalog
const getCatalog = h(async (req, res) => {
  const shop = await Shop.findOne({ _id: req.params.shopId, deletedAt: null }).lean();
  if (!shop) throw notFound();
  const designs = await Design.find({ shopId: shop._id, isPublic: true, deletedAt: null }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  const [photos, gs] = await Promise.all([
    Media.find({ entityType: 'design', entityId: { $in: designs.map((d) => d._id) }, deletedAt: null }).sort({ createdAt: 1 }).lean(),
    GarmentType.find({ _id: { $in: designs.map((d) => d.garmentTypeId).filter(Boolean) } }).lean(),
  ]);
  const g = new Map(gs.map((x) => [x._id, x]));
  res.set('Cache-Control', 'public, max-age=300');
  ok(res, {
    shop: { name: shop.name, phone: shop.phone, whatsappPhone: shop.whatsappPhone, address: shop.address, city: shop.city, logoUrl: shop.logoUrl },
    designs: designs.map((d) => ({ id: d._id, title: d.title, description: d.description, priceFromPaise: d.priceFromPaise, tags: d.tags,
      garment: d.garmentTypeId ? i18n.pick(req.lang, (g.get(d.garmentTypeId) || {}).name, (g.get(d.garmentTypeId) || {}).nameHi) : null,
      photos: photos.filter((p) => p.entityId === d._id).map((p) => p.url) })),
  });
});

module.exports = {
  getAppConfig,
  getLanguages,
  getPlans,
  trackOrder,
  getCatalog,
};
