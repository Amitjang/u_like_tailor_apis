// Design catalog + photos (media)
const { schema } = require('../utils/schema.helpers');
const { model, ref } = require('./model.helpers');

const Design = model('Design', schema({
  shopId: { type: String, required: true, index: true },
  garmentTypeId: ref,
  title: { type: String, required: true },
  description: String,
  priceFromPaise: Number,
  tags: { type: [String], default: [] },
  isPublic: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
}), 'designs');

const Media = model('Media', schema({
  shopId: { type: String, required: true },
  entityType: { type: String, enum: ['order', 'order_item', 'customer', 'member', 'fabric', 'design', 'staff', 'expense'], required: true },
  entityId: { type: String, required: true },
  kind: { type: String, enum: ['design_reference', 'fabric_photo', 'finished_product', 'customer_photo', 'bill', 'other'], required: true },
  url: { type: String, required: true }, // S3 / R2 / Firebase par upload ke baad URL
  thumbnailUrl: String,
  publicId: String, // Cloudinary — photo hatate waqt
  mimeType: String,
  sizeBytes: Number,
  caption: String,
  uploadedBy: String,
}).index({ shopId: 1, entityType: 1, entityId: 1 }), 'media');

module.exports = { Design, Media };
