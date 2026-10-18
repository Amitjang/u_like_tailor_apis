// Kapdon ke type ("services"): shirt, kurta... + naap ke khaane + voice words
const { schema, subSchema } = require('../utils/schema.helpers');
const { model, ref } = require('./model.helpers');

const MeasurementField = subSchema({
  key: { type: String, required: true },   // "chest" (measurement.values ki key)
  label: { type: String, required: true }, // "Chest"
  labelHi: String,                         // "छाती"
  voiceAliases: { type: [String], default: [] }, // bol kar naap: ["chest","chhati","seena","सीना"]
  minValue: Number,
  maxValue: Number,
  isRequired: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
});

// shopId null = system ka (sab dukaanon ko dikhta hai)

// shopId null = system ka (sab dukaanon ko dikhta hai)
const GarmentType = model('GarmentType', schema({
  shopId: ref,
  code: { type: String, required: true },
  name: { type: String, required: true },
  nameHi: String,
  gender: { type: String, enum: ['male', 'female', 'unisex', 'kids'], default: 'unisex' },
  defaultRatePaise: { type: Number, default: 0, min: 0 },
  defaultDays: { type: Number, default: 7 },
  diagramUrl: String,
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  fields: [MeasurementField],
}).index({ shopId: 1, code: 1, deletedAt: 1 }, { unique: true }), 'garment_types');

// shopId null = poore India ke tyohar (admin bharta hai)

module.exports = { GarmentType };
