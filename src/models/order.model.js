// Order + kapde (items) + status history
const { schema, subSchema } = require('../utils/schema.helpers');
const { model, ORDER_STATUS, dateStr, ref, Mixed } = require('./model.helpers');

const OrderItem = subSchema({
  memberId: { type: String, required: true },
  memberName: String,
  memberRelation: String,
  garmentTypeId: { type: String, required: true },
  garmentCode: String,
  garmentName: String,
  garmentNameHi: String,
  measurementId: ref,
  measurementSnapshot: { type: Mixed, default: {} }, // order ke time ke naap ki copy
  quantity: { type: Number, default: 1, min: 1 },
  ratePaise: { type: Number, default: 0, min: 0 },
  amountPaise: { type: Number, default: 0 },
  fabricSource: { type: String, enum: ['customer', 'shop'], default: 'customer' },
  fabricId: ref,
  fabricQtyUsed: Number,
  designId: ref,
  designNotes: String,
  status: { type: String, enum: ORDER_STATUS, default: 'received' },
  trialDate: { ...dateStr, default: null },
  deliveryDate: { ...dateStr, default: null },
  qrCode: String, // order tag ka QR
  deletedAt: { type: Date, default: null },
});
OrderItem.pre('validate', function () {
  this.amountPaise = (this.quantity || 0) * (this.ratePaise || 0);
});

const StatusChange = subSchema({
  itemId: ref, // null = poora order
  fromStatus: String,
  toStatus: String,
  changedByUserId: String,
  via: { type: String, enum: ['app', 'qr_scan', 'system'], default: 'app' },
  note: String,
  at: { type: Date, default: Date.now },
});

const Order = model('Order', schema({
  shopId: { type: String, required: true },
  orderNumber: { type: Number, default: null }, // offline order ko sync par milta hai
  customerId: { type: String, required: true },
  customerName: String,  // list/search ke liye copy (customer update par sync hoti hai)
  customerPhone: String,
  orderType: { type: String, enum: ['new', 'alteration', 'repair'], default: 'new' },
  parentOrderId: ref,
  status: { type: String, enum: ORDER_STATUS, default: 'received' },
  isUrgent: { type: Boolean, default: false },
  orderDate: dateStr,
  trialDate: { ...dateStr, default: null },
  promisedDeliveryDate: { ...dateStr, required: true },
  deliveredAt: Date,
  festivalId: ref,
  subtotalPaise: { type: Number, default: 0 },
  discountPaise: { type: Number, default: 0, min: 0 },
  taxPaise: { type: Number, default: 0, min: 0 },
  totalPaise: { type: Number, default: 0, min: 0 },
  paidPaise: { type: Number, default: 0 },    // payments se apne aap
  balancePaise: { type: Number, default: 0 }, // total - paid
  trackingToken: { type: String, required: true, unique: true }, // customer ka link: /t/<token>
  notes: String,
  cancelledReason: String,
  createdByUserId: String,
  items: [OrderItem],
  history: [StatusChange],
}).index({ shopId: 1, orderNumber: 1 }, { unique: true, partialFilterExpression: { orderNumber: { $type: 'number' } } })
  .index({ shopId: 1, status: 1, promisedDeliveryDate: 1 })
  .index({ shopId: 1, customerId: 1 })
  .index({ shopId: 1, trialDate: 1 })
  .index({ 'items.qrCode': 1 }), 'orders');

module.exports = { Order };
