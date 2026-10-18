// Karigar (staff/worker): piece rate, kaam, advance, payout, haaziri
const { schema } = require('../utils/schema.helpers');
const { model, TASKS, PAY_MODES, dateStr, ref } = require('./model.helpers');

const Staff = model('Staff', schema({
  shopId: { type: String, required: true, index: true },
  userId: ref, // agar karigar khud app chalata hai
  name: { type: String, required: true },
  phone: String,
  role: { type: String, enum: ['master', 'cutter', 'karigar', 'embroidery', 'helper', 'other'], required: true },
  payType: { type: String, enum: ['piece_rate', 'monthly', 'daily', 'mixed'], default: 'piece_rate' },
  monthlySalaryPaise: { type: Number, default: 0 },
  dailyWagePaise: { type: Number, default: 0 },
  skills: { type: [String], default: [] },
  joinedOn: dateStr,
  leftOn: dateStr,
  isActive: { type: Boolean, default: true },
  photoUrl: String,
  notes: String,
  // Festival planner: ek din mein kitne piece bana sakta hai
  capacity: [{ _id: false, garmentTypeId: String, piecesPerDay: { type: Number, min: 0 } }],
}), 'staff');

// staffId null = dukaan ka default rate

// staffId null = dukaan ka default rate
const PieceRate = model('PieceRate', schema({
  shopId: { type: String, required: true },
  garmentTypeId: { type: String, required: true },
  task: { type: String, enum: TASKS, required: true },
  staffId: ref,
  ratePaise: { type: Number, required: true, min: 0 },
  effectiveFrom: { ...dateStr, required: true },
}).index({ shopId: 1, garmentTypeId: 1, task: 1, staffId: 1, effectiveFrom: 1, deletedAt: 1 }, { unique: true }), 'piece_rates');

const workAssignmentSchema = schema({
  shopId: { type: String, required: true },
  orderId: { type: String, required: true },
  itemId: { type: String, required: true },
  staffId: { type: String, required: true },
  task: { type: String, enum: TASKS, required: true },
  quantity: { type: Number, default: 1, min: 1 },
  ratePaise: { type: Number, default: 0 },  // assign ke time ka rate (copy)
  amountPaise: { type: Number, default: 0 },
  status: { type: String, enum: ['assigned', 'in_progress', 'done', 'rework', 'cancelled'], default: 'assigned' },
  assignedAt: { type: Date, default: Date.now },
  dueDate: dateStr,
  completedAt: Date,
  payoutId: ref, // null = abhi payment baaki
}).index({ shopId: 1, staffId: 1, status: 1 }).index({ itemId: 1 });
workAssignmentSchema.pre('validate', function () {
  this.amountPaise = (this.quantity || 0) * (this.ratePaise || 0);
});

const WorkAssignment = model('WorkAssignment', workAssignmentSchema, 'work_assignments');

const StaffAdvance = model('StaffAdvance', schema({
  shopId: { type: String, required: true },
  staffId: { type: String, required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1 },
  givenOn: dateStr,
  mode: { type: String, enum: [...PAY_MODES, null], default: null },
  note: String,
  payoutId: ref,
}), 'staff_advances');

const StaffPayout = model('StaffPayout', schema({
  shopId: { type: String, required: true },
  staffId: { type: String, required: true, index: true },
  periodStart: dateStr,
  periodEnd: dateStr,
  pieceEarningsPaise: { type: Number, default: 0 },
  fixedEarningsPaise: { type: Number, default: 0 },
  bonusPaise: { type: Number, default: 0 },
  advanceDeductedPaise: { type: Number, default: 0 },
  netPaidPaise: { type: Number, default: 0 },
  workItems: Number,
  mode: { type: String, enum: [...PAY_MODES, null], default: null },
  paidAt: Date,
  note: String,
}), 'staff_payouts');

const Attendance = model('Attendance', schema({
  shopId: { type: String, required: true },
  staffId: { type: String, required: true },
  date: { ...dateStr, required: true },
  status: { type: String, enum: ['present', 'absent', 'half_day', 'leave'], required: true },
  note: String,
}).index({ staffId: 1, date: 1 }, { unique: true }).index({ shopId: 1, date: 1 }), 'attendance');

module.exports = { Staff, PieceRate, WorkAssignment, StaffAdvance, StaffPayout, Attendance };
