// WhatsApp automation rules, templates (hi/en), bheje gaye messages, in-app notifications.

const i18n = require('../utils/i18n');
const { Shop, MessageTemplate, OutboundMessage, Notification, Customer, EVENTS } = require('../models');
const { h, ok, bad, notFound, paging, requireBody } = require('../utils/http.helpers');
const { requireRole } = require('../middleware');
const { limitsOf } = require('../utils/plans');
const { enqueue } = require('../utils/notify');
const { templateVars } = require('../utils/template');
const { localize } = require('../utils/route.helpers');

// Har event + bhasha ka chalu template (dukaan ka apna, warna system ka)
async function effectiveTemplates(shopId, language) {
  const f = { shopId: { $in: [shopId, null] }, deletedAt: null, isActive: true };
  if (language) f.language = language;
  const list = await MessageTemplate.find(f).lean();
  const best = new Map();
  for (const t of list) {
    const k = `${t.event}|${t.language}`;
    const cur = best.get(k);
    if (!cur || (t.shopId && !cur.shopId)) best.set(k, t);
  }
  return [...best.values()].map((t) => ({ ...t, isCustom: t.shopId !== null })).sort((a, b) => a.event.localeCompare(b.event) || a.language.localeCompare(b.language));
}

// har rule ke saath hi/en template
// GET /api/messages/automation-rules
const getAutomationRules = h(async (req, res) => {
  const tpls = await effectiveTemplates(req.shopId);
  const rules = (req.shop.automationRules || []).map((rule) => ({
    ...rule,
    templateBody: Object.fromEntries(tpls.filter((t) => t.event === rule.event).map((t) => [t.language, t.body])),
  })).sort((a, b) => a.event.localeCompare(b.event));
  ok(res, { rules, planAllowsAutomation: !!(await limitsOf(req.shop)).whatsappAutomation });
});

// Body: {"isEnabled":true,"offsetMinutes":-1440,"sendTimeLocal":"10:00","repeatEveryDays":7,"maxRepeats":3}
// PUT /api/messages/automation-rules/:event
const updateAutomationRule = h(async (req, res) => {
  const ev = req.params.event;
  if (!EVENTS.includes(ev)) throw bad('event_invalid');
  const b = requireBody(req);
  if (b.sendTimeLocal !== undefined && b.sendTimeLocal !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.sendTimeLocal)) throw bad('field_invalid', 'sendTimeLocal');
  const shop = await Shop.findById(req.shopId);
  let rule = shop.automationRules.find((x) => x.event === ev);
  if (!rule) {
    shop.automationRules.push({ event: ev });
    rule = shop.automationRules[shop.automationRules.length - 1];
  }
  for (const k of ['isEnabled', 'offsetMinutes', 'sendTimeLocal', 'repeatEveryDays', 'maxRepeats']) if (b[k] !== undefined) rule[k] = b[k];
  await shop.save();
  ok(res, rule);
});

// Query: ?language=hi
// GET /api/messages/templates
const getTemplates = h(async (req, res) => {
  let lang = null;
  if (req.query.language) {
    lang = i18n.parse(req.query.language);
    if (!lang) throw bad('language_invalid');
  }
  ok(res, await effectiveTemplates(req.shopId, lang));
});

// Body: {"language":"en","body":"Hi {{customer_name}} ..."}
// Dukaan har bhasha ka apna message likh sakti hai. (Meta ke liye providerTemplateName approved hona chahiye.)
// PUT /api/messages/templates/:event
const saveTemplate = h(async (req, res) => {
  const ev = req.params.event;
  if (!EVENTS.includes(ev)) throw bad('event_invalid');
  const b = requireBody(req);
  if (!String(b.body || '').trim()) throw bad('template_body_required');
  let lang = req.lang;
  if (b.language !== undefined) {
    lang = i18n.parse(b.language);
    if (!lang) throw bad('language_invalid');
  }
  const t = await MessageTemplate.findOneAndUpdate(
    { shopId: req.shopId, event: ev, language: lang, deletedAt: null },
    { $set: { body: b.body, providerTemplateName: b.providerTemplateName || null, variables: Array.isArray(b.variables) ? b.variables : templateVars(b.body), isActive: true } },
    { upsert: true, new: true },
  ).lean();
  ok(res, t);
});

// Query: ?status=failed
// GET /api/messages
const getMessages = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = { shopId: req.shopId };
  if (req.query.status) f.status = req.query.status;
  const list = await OutboundMessage.find(f).sort({ scheduledAt: -1 }).skip(offset).limit(limit).lean();
  const cs = await Customer.find({ _id: { $in: list.map((m) => m.customerId).filter(Boolean) } }).select('name').lean();
  const cn = new Map(cs.map((c) => [c._id, c.name]));
  ok(res, {
    items: list.map((m) => ({ id: m._id, toPhone: m.toPhone, renderedBody: m.renderedBody, status: m.status, event: m.event, language: m.language,
      scheduledAt: m.scheduledAt, sentAt: m.sentAt, deliveredAt: m.deliveredAt, readAt: m.readAt, errorMessage: m.errorMessage,
      attempts: m.attempts, orderId: m.orderId, customerName: cn.get(m.customerId) || null })),
    limit, offset,
  });
});

// Body: {"customerId","message":"Diwali offer: 10% off!"}
// POST /api/messages/send
const sendMessage = h(async (req, res) => {
  const b = requireBody(req);
  if (!String(b.message || '').trim()) throw bad('message_empty');
  const c = await Customer.findOne({ _id: b.customerId, shopId: req.shopId, deletedAt: null }).lean();
  if (!c) throw notFound('customer_not_found');
  ok(res, localize(req, await enqueue({ shopId: req.shopId, customerId: c._id, event: 'custom', manual: true,
    vars: { customer_name: c.name, shop_name: req.shop.name, message: b.message } })));
});

// Query: ?unread=true
// GET /api/notifications
const getNotifications = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const f = { shopId: req.shopId, userId: { $in: [null, req.user._id] } };
  const unreadF = { ...f, readAt: null };
  const [items, unreadCount] = await Promise.all([
    Notification.find(req.query.unread === 'true' ? unreadF : f).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    Notification.countDocuments(unreadF),
  ]);
  ok(res, { items, unreadCount, limit, offset });
});

// Body: {"ids":[...]} ya {"all":true}
// POST /api/notifications/read
const markNotificationsRead = h(async (req, res) => {
  const b = requireBody(req);
  const f = { shopId: req.shopId, userId: { $in: [null, req.user._id] }, readAt: null };
  if (!b.all) f._id = { $in: Array.isArray(b.ids) ? b.ids : [] };
  await Notification.updateMany(f, { $set: { readAt: new Date() } });
  ok(res, { ok: true });
});

module.exports = {
  getAutomationRules,
  updateAutomationRule,
  getTemplates,
  saveTemplate,
  getMessages,
  sendMessage,
  getNotifications,
  markNotificationsRead,
};
