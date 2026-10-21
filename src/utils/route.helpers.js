// Routes ke chhote common helpers.
const i18n = require('./i18n');
const { ok, created, notFound, bad, pick, requireBody } = require('./http.helpers');
const cloudMedia = require('./cloud_media');

// WhatsApp result ki "reason" darzi ki bhasha mein (text khud customer ki bhasha mein hota hai)
function localize(req, msg) {
  if (msg && msg.reasonCode) msg.reason = i18n.t(req.lang, msg.reasonCode);
  return msg;
}

// Simple create / update / soft-delete (dukaan ke andar)
function crud(Model, fields, notFoundKey = 'not_found') {
  return {
    async create(req, res, extra = {}) {
      const doc = await Model.create({ ...pick(requireBody(req), fields), ...extra, shopId: req.shopId });
      created(res, doc);
    },
    async update(req, res) {
      const set = pick(requireBody(req), fields);
      if (!Object.keys(set).length) throw bad('no_fields', fields.join(', '));
      const where = { _id: req.params.id, shopId: req.shopId, deletedAt: null };
      const old = cloudMedia.touchesPhoto(set) ? await Model.findOne(where).select(cloudMedia.PHOTO_KEYS.join(' ')).lean() : null;
      const doc = await Model.findOneAndUpdate(where, { $set: set }, { new: true, runValidators: true }).lean();
      if (!doc) throw notFound(notFoundKey);
      cloudMedia.dropReplacedPhotos(old, set); // purani photo Cloudinary se hatao
      ok(res, doc);
    },
    async remove(req, res) {
      const r = await Model.updateOne({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: { deletedAt: new Date() } });
      if (!r.matchedCount) throw notFound(notFoundKey);
      ok(res, { deleted: true });
    },
  };
}

module.exports = { localize, crud };
