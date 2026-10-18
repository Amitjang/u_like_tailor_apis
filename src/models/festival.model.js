// Tyohar (rush planning)
const { schema } = require('../utils/schema.helpers');
const { model, dateStr, ref } = require('./model.helpers');

// shopId null = poore India ke tyohar (admin bharta hai)
const Festival = model('Festival', schema({
  shopId: ref,
  name: { type: String, required: true },
  nameHi: String,
  date: { ...dateStr, required: true },
  region: String,
  rushStartsDaysBefore: { type: Number, default: 21 },
  notes: String,
}).index({ date: 1 }), 'festivals');

module.exports = { Festival };
