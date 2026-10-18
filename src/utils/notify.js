// WhatsApp message banana aur queue mein daalna (customer ki bhasha mein).
const i18n = require('./i18n');
const { Customer, Shop, Order, MessageTemplate, OutboundMessage } = require('../models');
const { render, shareUrl } = require('./template');
const { rupees } = require('./money');
const { limitsOf } = require('./plans');

// Customer ki bhasha: apni, warna dukaan ki
function customerLang(customer, shop) {
  return i18n.parse(customer && customer.preferredLanguage) || i18n.parse(shop && shop.defaultLanguage) || i18n.DEFAULT;
}

// Template chuno: customer ki bhasha wala pehle, dukaan ka apna pehle, phir system ka
async function pickTemplate(shopId, event, lang) {
  const list = await MessageTemplate.find({ event, isActive: true, deletedAt: null, shopId: { $in: [shopId, null] } }).lean();
  list.sort((a, b) => ((b.language === lang) - (a.language === lang)) || ((b.shopId ? 1 : 0) - (a.shopId ? 1 : 0)));
  return list[0] || null;
}

function skip(res, code) {
  res.reasonCode = code;
  res.reason = i18n.t('en', code); // API ise darzi ki bhasha mein badal deta hai
  return res;
}

// Har haal mein text + share link wapas; plan + rule allow karein to queue bhi.
// opts: { shopId, customerId, orderId, event, vars, dedupeKey, scheduledAt, manual, fromRule }
async function enqueue(opts) {
  const [customer, shop] = await Promise.all([
    Customer.findOne({ _id: opts.customerId, shopId: opts.shopId }).lean(),
    Shop.findById(opts.shopId).lean(),
  ]);
  if (!customer || !shop) return { queued: false, reasonCode: 'wa_build_failed', reason: i18n.t('en', 'wa_build_failed') };
  const lang = customerLang(customer, shop);
  const tpl = await pickTemplate(shop._id, opts.event, lang);
  if (!tpl) return { queued: false, reasonCode: 'wa_no_template', reason: i18n.t('en', 'wa_no_template') };

  const phone = customer.whatsappPhone || customer.phone;
  const text = render(tpl.body, opts.vars);
  const res = { text, language: tpl.language, whatsappShareUrl: shareUrl(phone, text), queued: false };

  if (!customer.whatsappOptIn) return skip(res, 'wa_opted_out');
  const limits = await limitsOf(shop);
  if (!limits.whatsappAutomation) return skip(res, 'wa_plan_no_automation');
  if (!opts.manual && !opts.fromRule) {
    const rule = (shop.automationRules || []).find((r) => r.event === opts.event);
    if (!rule || !rule.isEnabled) return skip(res, 'wa_rule_disabled');
  }

  const params = (tpl.variables || []).map((v) => (opts.vars[v] === undefined ? '' : String(opts.vars[v])));
  try {
    await OutboundMessage.create({
      shopId: shop._id, customerId: customer._id, orderId: opts.orderId || null, templateId: tpl._id,
      event: opts.event, language: tpl.language, toPhone: phone, renderedBody: text,
      payload: { vars: opts.vars, params, templateName: tpl.providerTemplateName || null },
      scheduledAt: opts.scheduledAt || new Date(), dedupeKey: opts.dedupeKey || undefined,
    });
    res.queued = true;
  } catch (e) {
    if (e.code === 11000) return skip(res, 'wa_already_queued');
    throw e;
  }
  return res;
}

// Order wale templates ke variables, customer ki bhasha mein (kapdon ke naam, tareekh).
// customer_name, shop_name, shop_phone, order_number, garments, total, paid, balance,
// delivery_date, trial_date, tracking_link
async function orderVars(order, publicBaseUrl) {
  const [customer, shop] = await Promise.all([
    Customer.findById(order.customerId).lean(),
    Shop.findById(order.shopId).lean(),
  ]);
  const lang = customerLang(customer, shop);
  const garments = (order.items || [])
    .filter((it) => !it.deletedAt && it.status !== 'cancelled')
    .map((it) => i18n.pick(lang, it.garmentName, it.garmentNameHi) + (it.quantity > 1 ? ` x${it.quantity}` : ''))
    .join(', ');
  return {
    customer_name: customer ? customer.name : '',
    shop_name: shop ? shop.name : '',
    shop_phone: (shop && shop.phone) || '',
    order_number: order.orderNumber ? String(order.orderNumber) : '',
    garments,
    total: rupees(order.totalPaise),
    paid: rupees(order.paidPaise),
    balance: rupees(order.balancePaise),
    delivery_date: order.promisedDeliveryDate ? i18n.date(lang, order.promisedDeliveryDate) : '',
    trial_date: order.trialDate ? i18n.date(lang, order.trialDate) : '',
    tracking_link: `${publicBaseUrl}/t/${order.trackingToken}`,
  };
}

// Order se juda message (order ka kaam kabhi na ruke — galti par sirf wajah)
async function orderMessage(order, event, { publicBaseUrl, dedupeKey, manual } = {}) {
  try {
    const o = order.items ? order : await Order.findById(order).lean();
    const vars = await orderVars(o, publicBaseUrl);
    return await enqueue({ shopId: o.shopId, customerId: o.customerId, orderId: o._id, event, vars, dedupeKey, manual });
  } catch (e) {
    console.error(JSON.stringify({ level: 'ERROR', msg: 'order message', err: e.message }));
    return { queued: false, reasonCode: 'wa_build_failed', reason: i18n.t('en', 'wa_build_failed') };
  }
}

module.exports = { enqueue, orderVars, orderMessage, customerLang, pickTemplate };
