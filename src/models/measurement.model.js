// Naap (har badlaav naya version)
const { schema } = require('../utils/schema.helpers');
const { model, Mixed } = require('./model.helpers');

const Measurement = model('Measurement', schema({
  shopId: { type: String, required: true },
  customerId: { type: String, required: true },
  memberId: { type: String, required: true },
  garmentTypeId: { type: String, required: true },
  values: { type: Mixed, required: true }, // {"chest":38,"waist":32}
  unit: { type: String, enum: ['inch', 'cm'], default: 'inch' },
  fitPreference: { type: String, enum: ['slim', 'regular', 'loose', null], default: null },
  notes: String,
  inputMethod: { type: String, enum: ['manual', 'voice'], default: 'manual' },
  voiceTranscript: String,
  version: { type: Number, default: 1 },
  isCurrent: { type: Boolean, default: true },
  takenByUserId: String,
  takenAt: { type: Date, default: Date.now },
}).index({ memberId: 1, garmentTypeId: 1, isCurrent: 1 }).index({ shopId: 1, customerId: 1 }), 'measurements');

module.exports = { Measurement };
