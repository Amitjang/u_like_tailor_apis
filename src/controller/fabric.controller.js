// Kapda (stock), design catalog, photos.

const i18n = require('../utils/i18n');
const { Fabric, FabricTransaction, Design, Media, GarmentType, Order } = require('../models');
const { h, ok, created, bad, notFound, paging, requireBody, escapeRegex } = require('../utils/http.helpers');
const { requireRole } = require('../middleware');
const { refreshFabricStock } = require('../utils/orders');
const { crud } = require('../utils/route.helpers');
const cloudMedia = require('../utils/cloud_media');

const FABRIC_FIELDS = ['name', 'fabricType', 'color', 'quality', 'supplierName', 'supplierPhone', 'unit', 'lowStockThreshold', 'costPerUnitPaise', 'sellPerUnitPaise', 'photoUrl', 'notes'];
const fabricCrud = crud(Fabric, FABRIC_FIELDS, 'fabric_not_found');

// stockStatus: available / low_stock / out_of_stock ; stockStatusLabel user ki bhasha mein
function viewFabric(f, lang) {
  const status = f.stockQty <= 0 ? 'out_of_stock' : f.stockQty <= f.lowStockThreshold ? 'low_stock' : 'available';
  const label = { out_of_stock: ['Out of stock', 'स्टॉक खत्म'], low_stock: ['Low stock', 'कम स्टॉक'], available: ['Available', 'उपलब्ध'] }[status];
  return { ...f, isLow: f.stockQty <= f.lowStockThreshold, stockStatus: status, stockStatusLabel: i18n.pick(lang, ...label) };
}

// Query: ?q=cotton&lowStock=true
// GET /api/fabrics
const getFabrics = h(async (req, res) => {
  const f = { shopId: req.shopId, deletedAt: null };
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    f.$or = [{ name: rx }, { fabricType: rx }, { color: rx }];
  }
  if (req.query.lowStock === 'true') f.$expr = { $lte: ['$stockQty', '$lowStockThreshold'] };
  const list = await Fabric.find(f).sort({ name: 1 }).lean();
  ok(res, list.map((x) => viewFabric(x, req.lang)));
});

// Body: {"name":"Raymond Cotton","color":"White","initialQty":25,"costPerUnitPaise":18000}
// initialQty se pehli "purchase" entry apne aap
// POST /api/fabrics
const createFabric = h(async (req, res) => {
  const b = requireBody(req);
  const fab = await Fabric.create({ ...Object.fromEntries(FABRIC_FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])), shopId: req.shopId });
  if (Number(b.initialQty) > 0) {
    await FabricTransaction.create({ shopId: req.shopId, fabricId: fab._id, txnType: 'purchase', quantity: Number(b.initialQty),
      unitCostPaise: fab.costPerUnitPaise, note: 'Opening stock', createdBy: req.user._id });
    await refreshFabricStock(fab._id);
  }
  created(res, viewFabric(await Fabric.findById(fab._id).lean(), req.lang));
});

// PATCH /api/fabrics/:id
const updateFabric = h(fabricCrud.update);
// DELETE /api/fabrics/:id
const deleteFabric = h(fabricCrud.remove);

// GET /api/fabrics/:id/transactions
const getFabricTransactions = h(async (req, res) => {
  const { limit, offset } = paging(req);
  const list = await FabricTransaction.find({ fabricId: req.params.id, shopId: req.shopId, deletedAt: null }).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
  const orders = await Order.find({ _id: { $in: list.map((t) => t.orderId).filter(Boolean) } }).select('orderNumber').lean();
  const on = new Map(orders.map((o) => [o._id, o.orderNumber]));
  ok(res, { items: list.map((t) => ({ ...t, orderNumber: on.get(t.orderId) || null })), limit, offset });
});

// Body: {"txnType":"purchase","quantity":20,"unitCostPaise":18000}
// "used"/"sold" mein quantity positive bhejein, server minus kar dega
// POST /api/fabrics/:id/transactions
const addFabricTransaction = h(async (req, res) => {
  const b = requireBody(req);
  let q = Number(b.quantity);
  if (['purchase', 'return'].includes(b.txnType)) q = Math.abs(q);
  else if (['used', 'sold'].includes(b.txnType)) q = -Math.abs(q);
  else if (b.txnType !== 'adjustment') throw bad('txn_type_invalid');
  if (!q) throw bad('quantity_zero');
  const fab = await Fabric.findOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null }).lean();
  if (!fab) throw notFound('fabric_not_found');
  await FabricTransaction.create({ shopId: req.shopId, fabricId: fab._id, txnType: b.txnType, quantity: q, unitCostPaise: b.unitCostPaise, note: b.note, createdBy: req.user._id });
  await refreshFabricStock(fab._id);
  created(res, viewFabric(await Fabric.findById(fab._id).lean(), req.lang));
});

// ---------- Design catalog ----------
const designCrud = crud(Design, ['garmentTypeId', 'title', 'description', 'priceFromPaise', 'tags', 'isPublic', 'sortOrder']);

// GET /api/media/designs
const getDesigns = h(async (req, res) => {
  const f = { shopId: req.shopId, deletedAt: null };
  if (req.query.garmentTypeId) f.garmentTypeId = req.query.garmentTypeId;
  const list = await Design.find(f).sort({ sortOrder: 1, createdAt: -1 }).lean();
  const [gs, photos] = await Promise.all([
    GarmentType.find({ _id: { $in: list.map((d) => d.garmentTypeId).filter(Boolean) } }).lean(),
    Media.find({ entityType: 'design', entityId: { $in: list.map((d) => d._id) }, deletedAt: null }).sort({ createdAt: 1 }).lean(),
  ]);
  const g = new Map(gs.map((x) => [x._id, x]));
  ok(res, list.map((d) => ({ ...d, garment: d.garmentTypeId ? i18n.pick(req.lang, (g.get(d.garmentTypeId) || {}).name, (g.get(d.garmentTypeId) || {}).nameHi) : null,
    photos: photos.filter((p) => p.entityId === d._id).map((p) => ({ id: p._id, url: p.url, thumbnailUrl: p.thumbnailUrl })) })));
});
// POST /api/media/designs
const createDesign = h(designCrud.create);
// PATCH /api/media/designs/:id
const updateDesign = h(designCrud.update);
// DELETE /api/media/designs/:id
const deleteDesign = h(designCrud.remove);

// ---------- Photos ----------
// Photo pehle POST /api/media/upload (Cloudinary) par bhejein, phir mila URL yahan register karein.
const mediaCrud = crud(Media, ['entityType', 'entityId', 'kind', 'url', 'thumbnailUrl', 'publicId', 'mimeType', 'sizeBytes', 'caption']);

// Query: ?entityType=order&entityId=...
// GET /api/media
const getMedia = h(async (req, res) => {
  if (!req.query.entityType || !req.query.entityId) throw bad('media_entity_required');
  ok(res, await Media.find({ shopId: req.shopId, entityType: req.query.entityType, entityId: req.query.entityId, deletedAt: null }).sort({ createdAt: 1 }).lean());
});
// POST /api/media
const createMedia = h((req, res) => mediaCrud.create(req, res, { uploadedBy: req.user._id }));
// DELETE /api/media/:id  — Cloudinary se bhi hata do (jagah khaali)
const deleteMedia = h(async (req, res) => {
  const m = await Media.findOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null }).select('url publicId').lean();
  await mediaCrud.remove(req, res);
  if (m) cloudMedia.destroy(m.publicId || m.url);
});

// Purane DELIVERED orders ki photos hatao (sirf owner). Body: {"months":6,"dryRun":true}
//   dryRun = sirf ginti batao (kitni photos, kitni jagah), kuch mat hatao.
// POST /api/media/cleanup
const cleanupOldPhotos = h(async (req, res) => {
  const b = requireBody(req);
  const months = Number(b.months);
  if (!Number.isInteger(months) || months < 1 || months > 36) throw bad('cleanup_months_invalid');
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const orders = await Order.find({
    shopId: req.shopId, deletedAt: null, status: 'delivered',
    $or: [{ deliveredAt: { $lt: cutoff } }, { deliveredAt: null, updatedAt: { $lt: cutoff } }],
  }).select('_id items._id').lean();
  const orderIds = orders.map((o) => o._id);
  const itemIds = orders.flatMap((o) => (o.items || []).map((i) => i._id));
  const media = orders.length ? await Media.find({
    shopId: req.shopId, deletedAt: null,
    $or: [{ entityType: 'order', entityId: { $in: orderIds } }, { entityType: 'order_item', entityId: { $in: itemIds } }],
  }).select('url publicId sizeBytes').lean() : [];
  const bytes = media.reduce((s, m) => s + (m.sizeBytes || 0), 0);
  const result = { months, orders: orders.length, photos: media.length, bytes, deleted: 0 };
  if (b.dryRun || !media.length) return ok(res, result);
  await Media.updateMany({ _id: { $in: media.map((m) => m._id) } }, { $set: { deletedAt: new Date() } });
  // Cloudinary se ek-ek karke (thode-thode) hatao
  for (let i = 0; i < media.length; i += 10) {
    await Promise.all(media.slice(i, i + 10).map((m) => cloudMedia.destroy(m.publicId || m.url)));
  }
  ok(res, { ...result, deleted: media.length });
});

module.exports = {
  getFabrics,
  createFabric,
  updateFabric,
  deleteFabric,
  getFabricTransactions,
  addFabricTransaction,
  getDesigns,
  createDesign,
  updateDesign,
  deleteDesign,
  getMedia,
  createMedia,
  deleteMedia,
  cleanupOldPhotos,
};
