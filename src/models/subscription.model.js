// Plan ki kharid (Razorpay / manual) + receipt
const { schema } = require('../utils/schema.helpers');
const { model, Mixed } = require('./model.helpers');

const SubscriptionPayment = model('SubscriptionPayment', schema({
  shopId: { type: String, required: true, index: true },
  planId: { type: String, required: true },
  planCode: String,
  amountPaise: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  gateway: { type: String, enum: ['razorpay', 'manual'], required: true },
  gatewayOrderId: String,
  gatewayPaymentId: String,
  status: { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: 'created' },
  method: String,
  receiptNumber: String,   // ULT-2026-000001
  failureReason: String,
  note: String,
  createdBy: String,
  paidAt: Date,
  periodStart: Date,
  periodEnd: Date,
  raw: Mixed,
}).index({ gateway: 1, gatewayOrderId: 1 }, { unique: true, partialFilterExpression: { gatewayOrderId: { $type: 'string' } } })
  .index({ gatewayPaymentId: 1 }, { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } })
  .index({ receiptNumber: 1 }, { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' } } }),
'subscription_payments', false);

module.exports = { SubscriptionPayment };
