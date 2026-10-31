// Admin panel ke models:
//   AdminUser         — env (ADMIN_EMAILS / ADMIN_PHONES) ke alawa panel se jode gaye admin
//   MarketplaceConfig — commission, growth features (on/off + kaun sa plan), booking ke niyam (_id: "main")
//   Broadcast         — sab dukaanon ko bheji gayi notification ki history
const mongoose = require('mongoose');
const { schema } = require('../utils/schema.helpers');
const { model, Mixed } = require('./model.helpers');

const ADMIN_ROLES = ['owner', 'support']; // owner = sab kuch, support = sirf dekh sakta hai

const AdminUser = model('AdminUser', schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  name: String,
  role: { type: String, enum: ADMIN_ROLES, default: 'owner' },
  isActive: { type: Boolean, default: true },
  addedBy: String,
}), 'admin_users', false);

const MarketplaceConfig = mongoose.model('MarketplaceConfig', new mongoose.Schema({
  _id: { type: String, default: 'main' },
  commission: { type: Mixed, default: {} },
  features: { type: Mixed, default: {} },
  rules: { type: Mixed, default: {} },
  updatedBy: String,
}, { timestamps: true, versionKey: false, minimize: false }), 'marketplace_config');

const Broadcast = model('Broadcast', schema({
  title: { type: String, required: true },
  body: String,
  target: { type: String, enum: ['all', 'tier', 'shops', 'city'], required: true },
  tier: String,
  city: String,
  shopIds: [String],
  shopCount: { type: Number, default: 0 },
  sentBy: String,
}).index({ createdAt: -1 }), 'broadcasts', false);

module.exports = { AdminUser, MarketplaceConfig, Broadcast, ADMIN_ROLES };
