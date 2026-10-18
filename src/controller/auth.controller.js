// Login: Google / Apple (idToken) -> JWT access token + refresh token (rotation), profile.
// Phone + OTP: login ke baad phone number jodna (staff ka account owner ke jode number se milta hai).
// Purana phone OTP login (/otp/send, /otp/verify) bhi chalta hai — purani app ke liye.

const i18n = require('../utils/i18n');
const { User, OtpRequest, Session, Shop } = require('../models');
const { verifyGoogle, verifyApple } = require('../utils/social');
const { normalizePhone } = require('../utils/phone');
const { generateOtp, hashOtp, safeEqual, sha256, newRefreshToken, signAccess } = require('../utils/auth');
const { h, ok, bad, unauth, forbidden, tooMany, conflict, requireBody, ApiError } = require('../utils/http.helpers');
const { applyUserLang } = require('../middleware');
const { planOf } = require('../utils/plans');

const OTP_TTL = 5 * 60 * 1000;
const OTP_MAX_PER_WINDOW = 3; // 10 minute mein 3 OTP
const OTP_MAX_ATTEMPTS = 5;

// OTP banana + bhejna (WhatsApp ya log). Jawab: { sent, phone, expiresIn, devOtp? }
async function issueOtp(req, rawPhone) {
  const { cfg, wa } = req.app.locals;
  const phone = normalizePhone(rawPhone);
  if (!phone) throw bad('phone_invalid');
  const since10m = new Date(Date.now() - 10 * 60000);
  const [recent, ipRecent] = await Promise.all([
    OtpRequest.countDocuments({ phone, createdAt: { $gt: since10m } }),
    OtpRequest.countDocuments({ ip: req.ip, createdAt: { $gt: new Date(Date.now() - 3600000) } }),
  ]);
  if (recent >= OTP_MAX_PER_WINDOW || ipRecent >= 30) throw tooMany('otp_too_many_requests');

  const otp = cfg.devFixedOtp || generateOtp();
  await OtpRequest.create({ phone, otpHash: hashOtp(cfg.otpSecret, phone, otp), expiresAt: new Date(Date.now() + OTP_TTL), ip: req.ip });

  const out = { sent: true, phone, expiresIn: OTP_TTL / 1000 };
  if (cfg.otpProvider === 'whatsapp') {
    try {
      await wa.sendOtp({ to: phone, templateName: cfg.otpTemplateName, lang: req.lang, otp });
    } catch (e) {
      console.error(JSON.stringify({ level: 'ERROR', msg: 'otp send failed', err: e.message }));
      throw new ApiError(502, 'otp_send_failed', 'otp_send_failed');
    }
  } else {
    console.log(JSON.stringify({ level: 'INFO', msg: 'OTP (log provider)', phone, otp }));
    if (!cfg.isProd) out.devOtp = otp; // sirf development mein
  }
  return out;
}

// OTP check + ek hi baar istemaal (atomic). Sahi ho to normalized phone lautata hai.
async function consumeOtp(cfg, rawPhone, otp) {
  const phone = normalizePhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(String(otp || ''))) throw bad('phone_or_otp_invalid');
  const reqOtp = await OtpRequest.findOne({ phone, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  if (!reqOtp) throw bad('otp_expired');
  if (reqOtp.attempts >= OTP_MAX_ATTEMPTS) throw tooMany('otp_too_many_attempts');
  if (!safeEqual(reqOtp.otpHash, hashOtp(cfg.otpSecret, phone, String(otp)))) {
    await OtpRequest.updateOne({ _id: reqOtp._id }, { $inc: { attempts: 1 } });
    throw bad('otp_wrong');
  }
  const used = await OtpRequest.findOneAndUpdate({ _id: reqOtp._id, consumedAt: null }, { $set: { consumedAt: new Date() } });
  if (!used) throw bad('otp_used');
  return phone;
}

// Body: {"phone":"9876543210"}  (X-Language ki bhasha mein OTP)
// POST /api/auth/otp/send
const sendOtp = h(async (req, res) => {
  ok(res, await issueOtp(req, requireBody(req).phone));
});

// Body: {"phone","otp","deviceId","deviceName","appVersion","fcmToken"}
// POST /api/auth/otp/verify
const verifyOtp = h(async (req, res) => {
  const { cfg } = req.app.locals;
  const body = requireBody(req);
  const phone = await consumeOtp(cfg, body.phone, body.otp);

  // Naye user ki bhasha = request ki bhasha (X-Language / Accept-Language), warna Hindi
  const r = await User.findOneAndUpdate(
    { phone },
    { $set: { lastLoginAt: new Date(), phoneVerifiedAt: new Date() }, $setOnInsert: { phone, preferredLanguage: req.langHint || i18n.DEFAULT, isActive: true } },
    { upsert: true, new: true, includeResultMetadata: true },
  );
  const user = r.value;
  const isNewUser = !r.lastErrorObject.updatedExisting;
  if (!user.isActive) throw forbidden('account_disabled');

  const tokens = await newSession(cfg, user._id, body);
  applyUserLang(req, res, user.preferredLanguage);
  ok(res, { tokens, isNewUser, needsPhone: false, me: await profile(user._id) });
});

// ---------------- Google / Apple login ----------------
// Body: {"idToken","name"?,"deviceId","deviceName","appVersion","fcmToken"}
//   name: Apple sirf pehli baar naam deta hai — app wahi bhejti hai
// Jawab: { tokens, isNewUser, needsPhone, me }
//   needsPhone=true: app "apna mobile number jodo" screen dikhaye (staff ke liye zaroori, owner skip kar sakta hai)
function socialLogin(provider) {
  const field = provider === 'google' ? 'googleId' : 'appleId';
  return h(async (req, res) => {
    const { cfg } = req.app.locals;
    const body = requireBody(req);
    const ids = provider === 'google' ? cfg.googleClientIds : cfg.appleClientIds;
    if (!ids.length) throw new ApiError(503, 'social_login_not_configured', 'social_login_not_configured');
    const info = provider === 'google' ? await verifyGoogle(cfg, body.idToken) : await verifyApple(cfg, body.idToken);
    if (!info) throw unauth('social_token_invalid');

    let user = await User.findOne({ [field]: info.sub }).lean();
    let isNewUser = false;
    // Pehli baar is provider se: same (verified) email wala account ho to usi mein jodo
    if (!user && info.email && info.emailVerified) {
      user = await User.findOneAndUpdate({ email: info.email, [field]: null }, { $set: { [field]: info.sub } }, { new: true }).lean();
    }
    if (!user) {
      const name = String(body.name || info.name || '').trim().slice(0, 80) || undefined;
      try {
        user = (await User.create({ [field]: info.sub, email: info.email || undefined, name,
          preferredLanguage: req.langHint || i18n.DEFAULT, isActive: true })).toObject();
        isNewUser = true;
      } catch (e) {
        if (e && e.code === 11000) user = await User.findOne({ [field]: info.sub }).lean(); // do request ek saath
        else throw e;
      }
    }
    if (!user.isActive) throw forbidden('account_disabled');
    const set = { lastLoginAt: new Date() };
    if (!user.email && info.email) set.email = info.email;
    if (!user.name && (body.name || info.name)) set.name = String(body.name || info.name).trim().slice(0, 80);
    await User.updateOne({ _id: user._id }, { $set: set });

    const tokens = await newSession(cfg, user._id, body);
    applyUserLang(req, res, user.preferredLanguage);
    ok(res, { tokens, isNewUser, needsPhone: !user.phone, me: await profile(user._id) });
  });
}

const googleLogin = socialLogin('google');
const appleLogin = socialLogin('apple');

// ---------------- Phone jodna (login ke baad) ----------------
// Body: {"phone"}
// POST /api/auth/phone/send-otp
const sendPhoneOtp = h(async (req, res) => {
  ok(res, await issueOtp(req, requireBody(req).phone));
});

// Body: {"phone","otp","deviceId","deviceName","appVersion","fcmToken"}
// POST /api/auth/phone/verify
// Number kisi aur account par ho (jaise owner ne staff ko isi number se joda) to dono account ek ho jaate hain:
// Google/Apple ki pehchaan us purane account par chali jaati hai. Tab jawab mein NAYE tokens aate hain — app unhe save kare.
// Jawab: { me, merged, tokens? }
const verifyPhone = h(async (req, res) => {
  const { cfg } = req.app.locals;
  const body = requireBody(req);
  const phone = await consumeOtp(cfg, body.phone, body.otp);
  const me = await User.findById(req.user._id).lean();
  const other = await User.findOne({ phone }).lean();

  if (!other || other._id === me._id) {
    await User.updateOne({ _id: me._id }, { $set: { phone, phoneVerifiedAt: new Date() } });
    return ok(res, { merged: false, me: await profile(me._id) });
  }

  // Sirf woh account judta hai jiska abhi koi Google/Apple login nahi (owner ka banaya staff, ya purana phone-OTP account).
  // Number pehle se kisi Google/Apple account ka ho to nahi.
  if (other.googleId || other.appleId) throw conflict('phone_linked_other_account');
  const myShops = await Shop.countDocuments({ 'members.userId': me._id });
  const set = { phoneVerifiedAt: new Date(), isActive: true, lastLoginAt: new Date() };
  for (const f of ['googleId', 'appleId', 'email', 'name']) if (!other[f] && me[f]) set[f] = me[f];
  // Pehle naye (khaali) account se unique pehchaan hatao, phir purane par lagao
  await User.updateOne({ _id: me._id }, { $unset: { googleId: 1, appleId: 1 } });
  await User.updateOne({ _id: other._id }, { $set: set });
  if (myShops) {
    await Shop.updateMany({ 'members.userId': me._id }, { $set: { 'members.$[m].userId': other._id } }, { arrayFilters: [{ 'm.userId': me._id }] });
  }
  await User.deleteOne({ _id: me._id });
  await Session.updateMany({ userId: me._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  const tokens = await newSession(cfg, other._id, body);
  applyUserLang(req, res, other.preferredLanguage);
  ok(res, { merged: true, tokens, me: await profile(other._id) });
});

// Body: {"fcmToken"} — phone ka push token badle to (Firebase onTokenRefresh)
// POST /api/auth/fcm-token
const updateFcmToken = h(async (req, res) => {
  const t = String(requireBody(req).fcmToken || '').trim();
  if (t.length > 4096) throw bad('fcm_token_invalid');
  // Ek phone ka token sirf ek session par (logout/dusre account par purana band)
  if (t) await Session.updateMany({ fcmToken: t, _id: { $ne: req.sessionId } }, { $unset: { fcmToken: 1 } });
  await Session.updateOne({ _id: req.sessionId }, t ? { $set: { fcmToken: t } } : { $unset: { fcmToken: 1 } });
  ok(res, { saved: true });
});

async function newSession(cfg, userId, d = {}) {
  const { token, hash } = newRefreshToken();
  const expiresAt = new Date(Date.now() + cfg.refreshTtl * 1000);
  if (d.fcmToken) await Session.updateMany({ fcmToken: d.fcmToken }, { $unset: { fcmToken: 1 } }); // phone par naya login
  const s = await Session.create({
    userId, refreshTokenHash: hash, deviceId: d.deviceId, deviceName: d.deviceName,
    appVersion: d.appVersion, fcmToken: d.fcmToken, expiresAt, lastUsedAt: new Date(),
  });
  const access = signAccess(cfg.jwtSecret, userId, s._id, cfg.accessTtl);
  return { accessToken: access.token, accessExpiresAt: access.expiresAt, refreshToken: token, refreshExpiresAt: expiresAt };
}

// Body: {"refreshToken"} — har baar naya refresh token (purana band)
// POST /api/auth/refresh
const refreshToken = h(async (req, res) => {
  const { cfg } = req.app.locals;
  const body = requireBody(req);
  const { token, hash } = newRefreshToken();
  const expiresAt = new Date(Date.now() + cfg.refreshTtl * 1000);
  const set = { refreshTokenHash: hash, expiresAt, lastUsedAt: new Date() };
  if (body.fcmToken) set.fcmToken = body.fcmToken;
  const s = await Session.findOneAndUpdate(
    { refreshTokenHash: sha256(String(body.refreshToken || '')), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: set }, { new: true },
  ).lean();
  const user = s && (await User.findById(s.userId).lean());
  if (!s || !user || !user.isActive) throw unauth('session_expired');
  applyUserLang(req, res, user.preferredLanguage);
  const access = signAccess(cfg.jwtSecret, user._id, s._id, cfg.accessTtl);
  ok(res, { tokens: { accessToken: access.token, accessExpiresAt: access.expiresAt, refreshToken: token, refreshExpiresAt: expiresAt } });
});

// Profile: user + uski dukaanein
async function profile(userId) {
  const user = await User.findById(userId).select('-isActive -googleId -appleId').lean();
  if (user) user.hasPhone = !!user.phone;
  const shops = await Shop.find({ members: { $elemMatch: { userId, isActive: true } }, deletedAt: null }).sort({ createdAt: 1 }).lean();
  const list = [];
  for (const s of shops) {
    const m = s.members.find((x) => x.userId === userId);
    list.push({ id: s._id, name: s.name, city: s.city, logoUrl: s.logoUrl, defaultLanguage: s.defaultLanguage, role: m.role, plan: (await planOf(s)).code });
  }
  return { user, supportedLanguages: i18n.SUPPORTED, shops: list };
}

// Body: {"allDevices": false}
// POST /api/auth/logout
const logout = h(async (req, res) => {
  const all = req.body && req.body.allDevices === true;
  await Session.updateMany(all ? { userId: req.user._id, revokedAt: null } : { _id: req.sessionId },
    { $set: { revokedAt: new Date() }, $unset: { fcmToken: 1 } }); // logout ke baad push nahi
  ok(res, { loggedOut: true });
});

// GET /api/auth/me
const getProfile = h(async (req, res) => ok(res, await profile(req.user._id)));

// Body: {"name","preferredLanguage":"hi"|"en"} — bhasha isi response se lagu
// PATCH /api/auth/me
const updateProfile = h(async (req, res) => {
  const body = requireBody(req);
  const set = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.preferredLanguage !== undefined) {
    const l = i18n.parse(body.preferredLanguage);
    if (!l || l !== String(body.preferredLanguage).toLowerCase().slice(0, 2)) throw bad('language_invalid');
    set.preferredLanguage = l;
  }
  await User.updateOne({ _id: req.user._id }, { $set: set });
  if (set.preferredLanguage) applyUserLang(req, res, set.preferredLanguage);
  ok(res, await profile(req.user._id));
});

module.exports = {
  sendOtp,
  verifyOtp,
  googleLogin,
  appleLogin,
  sendPhoneOtp,
  verifyPhone,
  updateFcmToken,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  profile,
};
