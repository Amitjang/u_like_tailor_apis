// Models ke common constants + model() banane ka helper.
//   • Saari IDs UUID string (offline app khud bana sake).
//   • Paisa hamesha paise (integer): ₹150.50 = 15050.
//   • Sirf-tareekh wale fields "YYYY-MM-DD" string (IST).
//   • Har business document mein shopId — har query isi se filter hoti hai.
//   • deletedAt = soft delete (sync ke liye document rehta hai).
const { mongoose, syncPlugin } = require('../utils/schema.helpers');

const { Schema } = mongoose;
const { Mixed } = Schema.Types;
const LANGS = ['hi', 'en'];
const ORDER_STATUS = ['received', 'cutting', 'stitching', 'trial', 'ready', 'delivered', 'cancelled'];
const TASKS = ['cutting', 'stitching', 'finishing', 'embroidery', 'alteration'];
const PAY_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'other'];
const EVENTS = ['order_received', 'trial_reminder', 'order_ready', 'delivery_reminder', 'payment_due',
  'payment_received', 'birthday', 'anniversary', 'festival_offer', 'custom'];
const dateStr = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };
const ref = { type: String, default: null };

function model(name, s, collection, sync = true) {
  if (sync) s.plugin(syncPlugin);
  return mongoose.model(name, s, collection);
}

module.exports = { Schema, Mixed, LANGS, ORDER_STATUS, TASKS, PAY_MODES, EVENTS, dateStr, ref, model };
