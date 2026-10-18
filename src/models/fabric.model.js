// Kapda stock + entries
const { schema } = require('../utils/schema.helpers');
const { model, ref } = require('./model.helpers');

const Fabric = model('Fabric', schema({
  shopId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  fabricType: String,
  color: String,
  quality: String,
  supplierName: String,
  supplierPhone: String,
  unit: { type: String, enum: ['meter', 'piece'], default: 'meter' },
  stockQty: { type: Number, default: 0 }, // fabric_transactions ka jod (apne aap)
  lowStockThreshold: { type: Number, default: 5 },
  costPerUnitPaise: Number,
  sellPerUnitPaise: Number,
  photoUrl: String,
  notes: String,
}), 'fabrics');

const FabricTransaction = model('FabricTransaction', schema({
  shopId: { type: String, required: true },
  fabricId: { type: String, required: true, index: true },
  txnType: { type: String, enum: ['purchase', 'used', 'sold', 'adjustment', 'return'], required: true },
  quantity: { type: Number, required: true }, // +ve aaya, -ve gaya
  orderId: ref,
  itemId: ref,
  unitCostPaise: Number,
  note: String,
  createdBy: String,
}), 'fabric_transactions');

module.exports = { Fabric, FabricTransaction };
