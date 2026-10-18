// Saari settings environment variables (.env) se.
// .env hamesha project folder (package.json wala) se padha jaata hai — server kahin se bhi chalao
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { normalizePhone } = require('../utils/phone');

function get(key, def) {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v;
}

function list(v) {
  return (v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function duration(v, defSeconds) {
  // "15m", "1440h", "60d", "900" (seconds)
  if (!v) return defSeconds;
  const m = String(v).match(/^(\d+)\s*([smhd]?)$/);
  if (!m) return defSeconds;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400, '': 1 })[m[2]];
}

function load() {
  const c = {
    env: get('APP_ENV', 'dev'),
    port: Number(get('PORT', 5000)),
    mongoUri: get('MONGO_URI', get('MONGODB_URI', '')),

    jwtSecret: get('JWT_SECRET', ''),
    otpSecret: get('OTP_SECRET', ''),
    accessTtl: duration(get('ACCESS_TOKEN_TTL'), 15 * 60),
    refreshTtl: duration(get('REFRESH_TOKEN_TTL'), 60 * 86400),
    devFixedOtp: get('DEV_FIXED_OTP', ''), // sirf development: har number ka OTP yahi

    publicBaseUrl: get('PUBLIC_BASE_URL', 'http://localhost:5000').replace(/\/+$/, ''),
    corsOrigins: list(get('CORS_ORIGINS', '*')),
    runWorker: get('RUN_WORKER', 'false') === 'true',

    otpProvider: get('OTP_PROVIDER', 'log'), // log | whatsapp
    otpTemplateName: get('OTP_TEMPLATE_NAME', 'login_otp'),

    waProvider: get('WA_PROVIDER', 'log'), // log | meta_cloud
    waPhoneNumberId: get('WA_PHONE_NUMBER_ID', ''),
    waAccessToken: get('WA_ACCESS_TOKEN', ''),
    waAppSecret: get('WA_APP_SECRET', ''),
    waVerifyToken: get('WA_VERIFY_TOKEN', ''),
    waApiVersion: get('WA_API_VERSION', 'v20.0'),

    razorpayKeyId: get('RAZORPAY_KEY_ID', ''),
    razorpayKeySecret: get('RAZORPAY_KEY_SECRET', ''),
    razorpayWebhookSecret: get('RAZORPAY_WEBHOOK_SECRET', ''),
    razorpayBaseUrl: get('RAZORPAY_BASE_URL', 'https://api.razorpay.com'),
    adminPhones: [],
    adminEmails: list(get('ADMIN_EMAILS', '')).map((e) => e.toLowerCase()),

    // Google / Apple login: app se aaya idToken in IDs ke liye bana ho tabhi maana jaata hai
    googleClientIds: list(get('GOOGLE_CLIENT_IDS', '')),
    appleClientIds: list(get('APPLE_CLIENT_IDS', '')), // iOS bundle id (jaise com.uLikeTailor.uLikeTailor)
    googleCertsUrl: get('GOOGLE_CERTS_URL', 'https://www.googleapis.com/oauth2/v3/certs'),
    appleKeysUrl: get('APPLE_KEYS_URL', 'https://appleid.apple.com/auth/keys'),

    // Firebase push notification (FCM). Service account JSON, base64 mein (ek line).
    firebase: null,
    fcmBaseUrl: get('FCM_BASE_URL', 'https://fcm.googleapis.com'),
    googleTokenUrl: get('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
  };
  c.paymentProvider = get('PAYMENT_PROVIDER', c.razorpayKeyId ? 'razorpay' : 'none');
  c.isProd = c.env === 'prod';

  for (const p of list(process.env.ADMIN_PHONES)) {
    const n = normalizePhone(p);
    if (!n) throw new Error('ADMIN_PHONES mein galat number: ' + p);
    c.adminPhones.push(n);
  }

  const fb = get('FIREBASE_SERVICE_ACCOUNT_BASE64', '') || get('FIREBASE_SERVICE_ACCOUNT', '');
  if (fb) {
    let sa;
    try {
      sa = JSON.parse(fb.trim().startsWith('{') ? fb : Buffer.from(fb, 'base64').toString('utf8'));
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 sahi nahi hai (service account JSON ka base64 chahiye)');
    }
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      throw new Error('Firebase service account mein project_id, client_email, private_key chahiye');
    }
    c.firebase = { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: String(sa.private_key).replace(/\\n/g, '\n') };
  }

  if (!c.mongoUri) {
    throw new Error(`MONGO_URI zaroori hai. Project folder mein .env file banao (.env.example ki copy) aur usme MONGO_URI bharo. Dhoondha gaya: ${path.join(__dirname, '..', '..', '.env')}`);
  }
  if (c.jwtSecret.length < 32 || c.otpSecret.length < 32) {
    if (c.isProd) throw new Error('JWT_SECRET aur OTP_SECRET kam se kam 32 characters ke hone chahiye');
    c.jwtSecret = c.jwtSecret || 'dev-only-jwt-secret-change-me-0000000000';
    c.otpSecret = c.otpSecret || 'dev-only-otp-secret-change-me-0000000000';
  }
  if (c.isProd && c.devFixedOtp) throw new Error('DEV_FIXED_OTP production mein allowed nahi hai');
  if (c.waProvider === 'meta_cloud' && (!c.waPhoneNumberId || !c.waAccessToken)) {
    throw new Error('WA_PROVIDER=meta_cloud ke liye WA_PHONE_NUMBER_ID aur WA_ACCESS_TOKEN chahiye');
  }
  if (c.otpProvider === 'whatsapp' && c.waProvider !== 'meta_cloud') {
    throw new Error('OTP_PROVIDER=whatsapp ke liye WA_PROVIDER=meta_cloud chahiye');
  }
  if (c.paymentProvider === 'razorpay') {
    if (!c.razorpayKeyId || !c.razorpayKeySecret) {
      throw new Error('PAYMENT_PROVIDER=razorpay ke liye RAZORPAY_KEY_ID aur RAZORPAY_KEY_SECRET chahiye');
    }
    if (c.isProd && !c.razorpayWebhookSecret) throw new Error('production mein RAZORPAY_WEBHOOK_SECRET zaroori hai');
  }
  return c;
}

module.exports = { load, duration };
