// Customer + parivar (members)
const { schema, subSchema } = require('../utils/schema.helpers');
const { model, LANGS, dateStr, ref } = require('./model.helpers');

const FamilyMember = subSchema({
  name: { type: String, required: true },
  relation: { type: String, enum: ['self', 'spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'other'], default: 'self' },
  gender: { type: String, enum: ['male', 'female', 'other', null], default: null },
  dateOfBirth: { ...dateStr, default: null },     // birthday wish
  anniversaryDate: { ...dateStr, default: null }, // anniversary wish
  dobMD: String, // "10-08" (worker ki query ke liye, apne aap)
  annMD: String,
  notes: String,
  deletedAt: { type: Date, default: null },
});
FamilyMember.pre('validate', function () {
  this.dobMD = this.dateOfBirth ? this.dateOfBirth.slice(5) : undefined;
  this.annMD = this.anniversaryDate ? this.anniversaryDate.slice(5) : undefined;
});

const Customer = model('Customer', schema({
  shopId: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  whatsappPhone: String, // null = phone hi WhatsApp hai
  altPhone: String,
  address: String,
  area: String,
  photoUrl: String,
  tags: { type: [String], default: [] }, // VIP, regular
  notes: String,
  whatsappOptIn: { type: Boolean, default: true },
  preferredLanguage: { type: String, enum: [...LANGS, null], default: null }, // null = dukaan ki bhasha
  source: { type: String, enum: ['walk_in', 'referral', 'whatsapp', 'instagram', 'catalog_link', 'other', null], default: null },
  referredByCustomerId: ref,
  members: [FamilyMember], // parivar (ek number par poora ghar)
}).index({ shopId: 1, phone: 1, deletedAt: 1 }, { unique: true })
  .index({ shopId: 1, name: 1 })
  .index({ 'members.dobMD': 1 }).index({ 'members.annMD': 1 }), 'customers');

module.exports = { Customer };
