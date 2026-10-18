// Payment, UPI payment link, kharcha (expense)
const { schema } = require('../utils/schema.helpers');
const { model, PAY_MODES, dateStr, ref } = require('./model.helpers');

const Payment = model('Payment', schema({
  shopId: { type: String, required: true },
  customerId: { type: String, required: true },
  orderId: ref,
  amountPaise: { type: Number, required: true, min: 1 },
  direction: { type: String, enum: ['in', 'refund'], default: 'in' },
  purpose: { type: String, enum: ['advance', 'balance', 'udhaar', 'refund', 'other'], required: true },
  mode: { type: String, enum: PAY_MODES, required: true },
  referenceNo: String, // UPI UTR
  receivedAt: { type: Date, default: Date.now },
  receivedByUserId: String,
  note: String,
}).index({ shopId: 1, receivedAt: -1 }).index({ orderId: 1 }).index({ shopId: 1, customerId: 1 }), 'payments');

const PaymentLink = model('PaymentLink', schema({
  shopId: { type: String, required: true },
  customerId: String,
  orderId: String,
  amountPaise: Number,
  upiUri: String,
  status: { type: String, enum: ['active', 'paid', 'expired', 'cancelled'], default: 'active' },
}), 'payment_links', false);

const Expense = model('Expense', schema({
  shopId: { type: String, required: true },
  category: { type: String, enum: ['rent', 'electricity', 'thread_material', 'fabric_purchase', 'machine_repair', 'salary', 'tea_snacks', 'other'], required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  spentOn: dateStr,
  mode: { type: String, enum: [...PAY_MODES, null], default: null },
  note: String,
  createdBy: String,
}).index({ shopId: 1, spentOn: -1 }), 'expenses');

module.exports = { Payment, PaymentLink, Expense };
