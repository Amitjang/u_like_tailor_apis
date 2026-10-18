// Sabhi models ke common helpers: UUID ids, counters, offline-sync plugin.
// (Database connection: src/config/db.js)
const crypto = require('crypto');
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

// Saari IDs UUID string hain (Mongo ke ObjectId nahi), taaki mobile app OFFLINE
// mein bhi naya record bana sake aur baad mein sync kare.
const uuid = () => crypto.randomUUID();
const idField = { type: String, default: uuid };

// ---------- Counters (order number, receipt number, sync sequence) ----------
const Counter = mongoose.model(
  'Counter',
  new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }),
  'counters',
);

async function nextSeq(name, by = 1) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: by } }, { upsert: true, new: true }).lean();
  return c.seq;
}

// ---------- Offline sync plugin ----------
// Har insert/update par document ko naya "syncSeq" milta hai. App bolta hai
// "mere paas seq 5021 tak hai", server usse aage ke documents bhejta hai (deleted bhi).
function syncPlugin(schema) {
  schema.add({ syncSeq: { type: Number, index: true }, deletedAt: { type: Date, default: null } });
  schema.pre('save', async function () {
    this.syncSeq = await nextSeq('sync');
  });
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], async function () {
    const seq = await nextSeq('sync');
    const upd = this.getUpdate() || {};
    const onlyInsert = Object.keys(upd).every((k) => k === '$setOnInsert');
    if (onlyInsert) {
      // Sirf "na ho to banao" (seed) — maujood document ko badla hua mat maano
      upd.$setOnInsert = { ...(upd.$setOnInsert || {}), syncSeq: seq };
    } else {
      upd.$set = { ...(upd.$set || {}), syncSeq: seq };
    }
    this.setUpdate(upd);
  });
  schema.pre('insertMany', function (next, docs) {
    const list = Array.isArray(docs) ? docs : [docs];
    nextSeq('sync', list.length)
      .then((last) => {
        list.forEach((d, i) => { d.syncSeq = last - list.length + 1 + i; });
        next();
      })
      .catch(next);
  });
}

// Standard schema: UUID _id, createdAt/updatedAt
function schema(def, opts = {}) {
  return new mongoose.Schema({ _id: idField, ...def }, { timestamps: true, versionKey: false, ...opts });
}

// Embedded (andar wale) documents ka schema, unki bhi UUID
function subSchema(def, opts = {}) {
  return new mongoose.Schema({ _id: idField, ...def }, { versionKey: false, ...opts });
}

module.exports = { mongoose, uuid, idField, nextSeq, syncPlugin, schema, subSchema, Counter };
