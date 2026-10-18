// Login: user (Google / Apple), OTP (sirf phone jodne ke liye), session (refresh token)
const { schema } = require('../utils/schema.helpers');
const { model, LANGS } = require('./model.helpers');

// phone ab zaroori nahi: Google/Apple se login. Phone OTP se verify karke judta hai
// (staff ko owner phone number se jodta hai — wahi number daalne par dono account ek ho jaate hain).
const User = model('User', schema({
  phone: { type: String, unique: true, sparse: true }, // +91XXXXXXXXXX
  phoneVerifiedAt: Date,
  email: { type: String, lowercase: true, trim: true, index: true, sparse: true },
  googleId: { type: String, unique: true, sparse: true },
  appleId: { type: String, unique: true, sparse: true },
  name: String,
  preferredLanguage: { type: String, enum: LANGS, default: 'hi' },
  isActive: { type: Boolean, default: true },
  lastLoginAt: Date,
}), 'users', false);

const OtpRequest = model('OtpRequest', schema({
  phone: { type: String, required: true },
  otpHash: { type: String, required: true }, // OTP kabhi plain save nahi hota
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
  ip: String,
}).index({ phone: 1, createdAt: -1 }).index({ ip: 1, createdAt: -1 })
  .index({ createdAt: 1 }, { expireAfterSeconds: 86400 }), 'otp_requests', false); // 1 din baad apne aap delete

const Session = model('Session', schema({
  userId: { type: String, required: true, index: true },
  refreshTokenHash: { type: String, required: true, unique: true },
  deviceId: String,
  deviceName: String,
  appVersion: String,
  fcmToken: String,
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  lastUsedAt: Date,
}).index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 86400 }), 'sessions', false);

module.exports = { User, OtpRequest, Session };
