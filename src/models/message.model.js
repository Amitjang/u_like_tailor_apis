// WhatsApp templates, bheje gaye messages (queue), in-app notifications
const { schema } = require('../utils/schema.helpers');
const { model, LANGS, EVENTS, ref, Mixed } = require('./model.helpers');

const MessageTemplate = model('MessageTemplate', schema({
  shopId: ref, // null = system default
  event: { type: String, enum: EVENTS, required: true },
  language: { type: String, enum: LANGS, required: true },
  body: { type: String, required: true }, // "नमस्ते {{customer_name}} जी ..."
  providerTemplateName: String,           // Meta par approved template ka naam
  variables: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
}).index({ shopId: 1, event: 1, language: 1, deletedAt: 1 }, { unique: true }), 'message_templates');

const OutboundMessage = model('OutboundMessage', schema({
  shopId: { type: String, required: true },
  customerId: String,
  orderId: String,
  templateId: String,
  event: String,
  language: { type: String, enum: LANGS },
  channel: { type: String, enum: ['whatsapp', 'sms'], default: 'whatsapp' },
  toPhone: { type: String, required: true },
  renderedBody: { type: String, required: true },
  payload: { type: Mixed, default: {} }, // template variables + params
  status: { type: String, enum: ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled'], default: 'queued' },
  scheduledAt: { type: Date, default: Date.now },
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  provider: String,
  providerMessageId: String,
  errorMessage: String,
  attempts: { type: Number, default: 0 },
  // Ek reminder do baar na jaaye: "trial:<orderId>:2026-10-05"
  dedupeKey: String,
}).index({ status: 1, scheduledAt: 1 })
  .index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } })
  .index({ providerMessageId: 1 }, { sparse: true })
  .index({ shopId: 1, scheduledAt: -1 }), 'outbound_messages', false);

const notificationSchema = schema({
  shopId: { type: String, required: true },
  userId: ref, // null = dukaan ke sab log
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: String,
  data: { type: Mixed, default: {} },
  readAt: Date,
}).index({ shopId: 1, createdAt: -1 }).index({ shopId: 1, type: 1 }).index({ shopId: 1, 'data.orderId': 1, type: 1 });

// Nayi notification bante hi phone par push (Firebase). Push fail ho to bhi notification save rehti hai.
notificationSchema.pre('save', function () {
  this.$locals.wasNew = this.isNew;
});
notificationSchema.post('save', function (doc) {
  if (!doc.$locals.wasNew) return;
  const n = doc.toObject();
  setImmediate(() => {
    require('../utils/push').pushNotification(n)
      .catch((e) => console.error(JSON.stringify({ level: 'ERROR', msg: 'push', err: e.message })));
  });
});

const Notification = model('Notification', notificationSchema, 'notifications', false);

module.exports = { MessageTemplate, OutboundMessage, Notification };
