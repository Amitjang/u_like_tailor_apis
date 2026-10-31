// Admin panel mein kisne kab kya badla (sirf padhne ke liye — kabhi badla nahi jaata)
const { schema } = require('../utils/schema.helpers');
const { model, Mixed } = require('./model.helpers');

const AdminLog = model('AdminLog', schema({
  userId: String,
  email: String,
  action: { type: String, required: true }, // "PATCH /shops/:id"
  path: String,
  targetId: String,
  body: { type: Mixed, default: {} },
  ip: String,
}).index({ createdAt: -1 }), 'admin_logs', false);

module.exports = { AdminLog };
