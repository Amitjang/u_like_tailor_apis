// Dukaan: team (members), chalu plan (subscription), WhatsApp rules
const { schema, subSchema } = require('../utils/schema.helpers');
const { model, LANGS, EVENTS, Mixed } = require('./model.helpers');

const ShopMember = subSchema({
  userId: { type: String, required: true },
  role: { type: String, enum: ['owner', 'manager', 'staff'], required: true },
  permissions: { type: Mixed, default: {} },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const AutomationRule = subSchema({
  event: { type: String, enum: EVENTS, required: true },
  isEnabled: { type: Boolean, default: true },
  offsetMinutes: { type: Number, default: 0 },   // trial se 1 din pehle = -1440
  sendTimeLocal: { type: String, default: null }, // "10:00" (raat ko message nahi)
  repeatEveryDays: { type: Number, default: null },
  maxRepeats: { type: Number, default: null },
});

const Shop = model('Shop', schema({
  ownerUserId: { type: String, required: true },
  name: { type: String, required: true },
  phone: String,
  whatsappPhone: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
  logoUrl: String,
  upiId: String,
  gstin: String,
  invoicePrefix: { type: String, default: 'ULT' },
  defaultLanguage: { type: String, enum: LANGS, default: 'hi' }, // naye customers ki WhatsApp bhasha
  measurementUnit: { type: String, enum: ['inch', 'cm'], default: 'inch' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // 0 = Sunday
  settings: { type: Mixed, default: {} },
  members: [ShopMember],
  subscription: { // chalu plan (history: subscription_payments)
    planId: String,
    planCode: String,
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    startsAt: Date,
    endsAt: { type: Date, default: null }, // null = kabhi khatam nahi (Free)
    lastPaymentId: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  automationRules: [AutomationRule],
  orderCounter: { type: Number, default: 0 },
}).index({ 'members.userId': 1 }).index({ 'subscription.endsAt': 1 }), 'shops');

module.exports = { Shop };
