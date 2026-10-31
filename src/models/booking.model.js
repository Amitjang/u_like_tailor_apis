// Online booking (customer app <-> dukaan):
//   Booking          — customer ka slot (naap / trial / pickup), dukaan accept / decline karti hai
//   SlotBlock        — dukaan ne koi slot band kiya (walk-in, personal kaam)
//   Waitlist         — din full ho to "slot khule to batana"
//   Review           — kaam poora hone ke baad rating
//   UserNotification — customer (app user) ki notification (dukaan wali Notification alag hai)
const { schema, subSchema } = require('../utils/schema.helpers');
const { model, Mixed, dateStr, ref } = require('./model.helpers');

const BOOKING_STATUS = ['pending', 'confirmed', 'declined', 'cancelled', 'expired', 'no_show', 'completed'];
const ACTIVE_BOOKING = ['pending', 'confirmed']; // ye slot gherte hain
const PURPOSES = ['measurement', 'trial', 'pickup', 'alteration', 'other'];
const ADVANCE_STATUS = ['none', 'due', 'claimed', 'received', 'refund_due', 'refunded', 'kept'];
const time = { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ };

const Booking = model('Booking', schema({
  shopId: { type: String, required: true },
  userId: { type: String, required: true },          // customer app ka user
  number: { type: Number, required: true },          // B-1042
  customer: {                                        // booking ke waqt ka naam / phone
    name: { type: String, required: true },
    phone: { type: String, required: true },
    whatsapp: { type: Boolean, default: true },
  },
  customerId: ref,                                   // dukaan ki customer list mein (confirm par)
  date: { ...dateStr, required: true },
  time: { ...time, required: true },
  startsAt: { type: Date, required: true },
  durationMin: { type: Number, default: 30 },
  purpose: { type: String, enum: PURPOSES, default: 'measurement' },
  items: [subSchema({ garment: { type: String, required: true }, qty: { type: Number, default: 1, min: 1, max: 50 } })],
  fabric: {
    mode: { type: String, enum: ['own', 'shop'], default: 'own' },
    fabricId: String,
    name: String,
    meters: Number,
    pricePaise: Number,                              // dukaan ka kapda: meters x rate
  },
  notes: String,
  status: { type: String, enum: BOOKING_STATUS, default: 'pending' },
  autoConfirmed: { type: Boolean, default: false },
  respondBy: Date,                                   // pending: itne tak jawab na mile to expire
  decidedAt: Date,
  cancelledBy: { type: String, enum: ['customer', 'shop', 'system', null], default: null },
  reason: String,
  reschedules: { type: Number, default: 0 },
  advance: {
    duePaise: { type: Number, default: 0 },
    status: { type: String, enum: ADVANCE_STATUS, default: 'none' },
    utr: String,
    updatedAt: Date,
  },
  commission: { type: Mixed, default: {} },          // booking ke waqt ki commission setting (abhi off = 0)
  orderId: ref,
  reminded: { d1: { type: Boolean, default: false }, h2: { type: Boolean, default: false } },
  reviewId: ref,
  history: [subSchema({ at: { type: Date, default: Date.now }, by: String, action: String, note: String })],
}).index({ shopId: 1, date: 1, status: 1 }).index({ userId: 1, startsAt: -1 }).index({ status: 1, respondBy: 1 })
  .index({ status: 1, startsAt: 1 }).index({ shopId: 1, number: 1 }, { unique: true }), 'bookings', false);

const SlotBlock = model('SlotBlock', schema({
  shopId: { type: String, required: true },
  date: { ...dateStr, required: true },
  time: { ...time, required: true },
  note: String,
  createdBy: String,
}).index({ shopId: 1, date: 1, time: 1 }, { unique: true }), 'slot_blocks', false);

const WAIT_STATUS = ['waiting', 'offered', 'booked', 'expired', 'cancelled'];
const Waitlist = model('Waitlist', schema({
  shopId: { type: String, required: true },
  userId: { type: String, required: true },
  date: { ...dateStr, required: true },
  parts: { type: [String], default: ['morning', 'afternoon', 'evening'] }, // subah <12, dopahar 12-17, shaam 17+
  customer: { name: String, phone: String },
  purpose: { type: String, enum: PURPOSES, default: 'measurement' },
  items: [subSchema({ garment: String, qty: Number })],
  status: { type: String, enum: WAIT_STATUS, default: 'waiting' },
  offer: { time: String, expiresAt: Date },
  bookingId: ref,
}).index({ shopId: 1, date: 1, status: 1, createdAt: 1 }).index({ userId: 1, createdAt: -1 }).index({ status: 1, 'offer.expiresAt': 1 }),
'waitlist', false);

const Review = model('Review', schema({
  shopId: { type: String, required: true },
  userId: { type: String, required: true },
  bookingId: { type: String, required: true, unique: true },
  userName: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  fitting: { type: Number, min: 1, max: 5 },
  onTime: { type: Number, min: 1, max: 5 },
  value: { type: Number, min: 1, max: 5 },
  text: { type: String, maxlength: 1000 },
  photos: { type: [String], default: [] },
  reply: { text: String, at: Date },
  hiddenAt: { type: Date, default: null },
  hiddenReason: String,
}).index({ shopId: 1, hiddenAt: 1, createdAt: -1 }), 'reviews', false);

const userNotificationSchema = schema({
  userId: { type: String, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: String,
  data: { type: Mixed, default: {} },
  readAt: Date,
}).index({ userId: 1, createdAt: -1 });
userNotificationSchema.pre('save', function () { this.$locals.wasNew = this.isNew; });
userNotificationSchema.post('save', function (doc) {
  if (!doc.$locals.wasNew) return;
  const n = doc.toObject();
  setImmediate(() => {
    require('../utils/push').pushUser(n).catch((e) => console.error(JSON.stringify({ level: 'ERROR', msg: 'push user', err: e.message })));
  });
});
const UserNotification = model('UserNotification', userNotificationSchema, 'user_notifications', false);

module.exports = { Booking, SlotBlock, Waitlist, Review, UserNotification, BOOKING_STATUS, ACTIVE_BOOKING, PURPOSES, ADVANCE_STATUS, WAIT_STATUS };
