// Kapde ke type, naap ke khaane, bole gaye naap (voice).

const i18n = require('../utils/i18n');
const { GarmentType } = require('../models');
const { h, ok, created, bad, notFound, pick, requireBody } = require('../utils/http.helpers');
const { requireRole } = require('../middleware');
const voice = require('../utils/voice');

const GARMENT_FIELDS = ['code', 'name', 'nameHi', 'gender', 'defaultRatePaise', 'defaultDays', 'diagramUrl', 'isActive', 'sortOrder'];

// displayName / displayLabel user ki bhasha mein
function viewGarment(g, lang) {
  return {
    ...g,
    displayName: i18n.pick(lang, g.name, g.nameHi),
    isSystem: g.shopId === null,
    fields: (g.fields || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ ...f, displayLabel: i18n.pick(lang, f.label, f.labelHi) })),
  };
}

// System ka ya isi dukaan ka garment type
async function findGarment(shopId, id) {
  return GarmentType.findOne({ _id: id, shopId: { $in: [shopId, null] }, deletedAt: null }).lean();
}

function cleanFields(fields) {
  if (fields === undefined) return undefined;
  if (!Array.isArray(fields)) throw bad('fields_invalid');
  return fields.map((f, i) => {
    if (!f || !f.key || !f.label) throw bad('field_key_label_required', i + 1);
    return {
      key: String(f.key), label: String(f.label), labelHi: f.labelHi || undefined,
      voiceAliases: Array.isArray(f.voiceAliases) ? f.voiceAliases.map(String) : [],
      minValue: f.minValue ?? undefined, maxValue: f.maxValue ?? undefined,
      isRequired: !!f.isRequired, sortOrder: f.sortOrder ?? i + 1,
    };
  });
}

// Body: (system + dukaan ke apne, naap ke khaanon ke saath)
// GET /api/services
const getServices = h(async (req, res) => {
  const list = await GarmentType.find({ shopId: { $in: [req.shopId, null] }, deletedAt: null, isActive: true })
    .sort({ shopId: 1, sortOrder: 1, name: 1 }).lean();
  // System wale pehle
  list.sort((a, b) => (a.shopId === null ? 0 : 1) - (b.shopId === null ? 0 : 1) || a.sortOrder - b.sortOrder);
  ok(res, list.map((g) => viewGarment(g, req.lang)));
});

// {"code":"sherwani","name":"Sherwani","nameHi":"शेरवानी","fields":[{"key":"chest","label":"Chest","labelHi":"छाती","voiceAliases":["chhati"]}]}
// POST /api/services
const createService = h(async (req, res) => {
  const body = requireBody(req);
  const g = await GarmentType.create({ ...pick(body, GARMENT_FIELDS), shopId: req.shopId, fields: cleanFields(body.fields) || [] });
  created(res, viewGarment(g.toObject(), req.lang));
});

// Body: (sirf dukaan ke apne; system wale nahi)
// PATCH /api/services/:id
const updateService = h(async (req, res) => {
  const set = pick(requireBody(req), GARMENT_FIELDS);
  if (!Object.keys(set).length) throw bad('no_fields', GARMENT_FIELDS.join(', '));
  const g = await GarmentType.findOneAndUpdate({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: set }, { new: true, runValidators: true }).lean();
  if (!g) throw notFound('garment_not_found_or_system');
  ok(res, viewGarment(g, req.lang));
});

// Body: {"fields":[...]} — poori list replace
// PUT /api/services/:id/fields
const updateServiceFields = h(async (req, res) => {
  const fields = cleanFields(requireBody(req).fields) || [];
  const g = await GarmentType.findOneAndUpdate({ _id: req.params.id, shopId: req.shopId, deletedAt: null }, { $set: { fields } }, { new: true }).lean();
  if (!g) throw notFound('garment_not_found_or_system');
  ok(res, viewGarment(g, req.lang));
});

// Naap ke khaane sahi hain? Galat khaana = error; min/max se bahar = sirf warning
function checkValues(lang, garment, values) {
  const fields = garment.fields || [];
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const warnings = [];
  for (const [k, v] of Object.entries(values)) {
    const f = byKey.get(k);
    if (!f) throw bad('unknown_measurement', k);
    const label = i18n.pick(lang, f.label, f.labelHi);
    if (typeof v !== 'number' || !(v > 0)) throw bad('measurement_positive', label);
    if ((f.minValue != null && v < f.minValue) || (f.maxValue != null && v > f.maxValue)) {
      warnings.push(i18n.t(lang, 'warn_out_of_range', label, v));
    }
  }
  for (const f of fields) {
    if (f.isRequired && values[f.key] === undefined) warnings.push(i18n.t(lang, 'warn_missing', i18n.pick(lang, f.label, f.labelHi)));
  }
  return warnings;
}

// Body: {"garmentTypeId","transcript":"chhati 38 aur aadha, kamar 32"}
// POST /api/services/voice/parse
const parseVoice = h(async (req, res) => {
  const body = requireBody(req);
  const g = await findGarment(req.shopId, body.garmentTypeId);
  if (!g || !(g.fields || []).length) throw notFound('garment_fields_not_found');
  const out = voice.parse(String(body.transcript || ''), g.fields.map((f) => ({ key: f.key, aliases: f.voiceAliases })));
  ok(res, { values: out.values, unmatchedWords: out.unmatched, warnings: checkValues(req.lang, g, out.values) });
});

module.exports = {
  getServices,
  createService,
  updateService,
  updateServiceFields,
  parseVoice,
  findGarment,
  checkValues,
  viewGarment,
};
