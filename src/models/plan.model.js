// Subscription plans (Free / Growth / Pro)
const { schema } = require('../utils/schema.helpers');
const { model, Mixed } = require('./model.helpers');

const Plan = model('Plan', schema({
  code: { type: String, required: true, unique: true }, // free, growth, growth_yearly, pro, pro_yearly
  tier: { type: String, required: true },                // free / growth / pro
  name: { type: String, required: true },
  nameHi: String,
  description: String,
  descriptionHi: String,
  pricePaise: { type: Number, required: true, min: 0 },  // GST ke saath
  billingPeriod: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'lifetime'], required: true },
  // {maxCustomers:100, maxOrdersPerMonth:100, maxStaff:1, whatsappAutomation:false, multiUser:false ...}
  // null = unlimited
  limits: { type: Mixed, default: {} },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}), 'plans', false);

module.exports = { Plan };
