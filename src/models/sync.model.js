// Offline sync: har phone ka last pull
const { schema } = require('../utils/schema.helpers');
const { model } = require('./model.helpers');

const SyncDevice = model('SyncDevice', schema({
  shopId: { type: String, required: true },
  userId: String,
  deviceId: { type: String, required: true },
  lastPulledSeq: { type: Number, default: 0 },
  lastSeenAt: Date,
}).index({ shopId: 1, deviceId: 1 }, { unique: true }), 'sync_devices', false);

module.exports = { SyncDevice };
