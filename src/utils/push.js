// Firebase push notification (FCM HTTP v1). App band ho ya khuli — phone par notification aati hai.
// Koi extra package nahi: service account se Google OAuth token banta hai (jsonwebtoken se), phir FCM API.
//
// Har nayi in-app Notification (models/message.model.js) apne aap yahan se dukaan ke logon ke phone par jaati hai.
// Firebase set nahi (FIREBASE_SERVICE_ACCOUNT_BASE64 khaali) to chupchaap kuch nahi hota.
const jwt = require('jsonwebtoken');
const config = require('../config/env');

let CFG = null;
const cfg = () => CFG || (CFG = config.load());
let tokenCache = { token: null, exp: 0 };

const log = (level, msg, extra = {}) => console[level === 'ERROR' ? 'error' : 'log'](JSON.stringify({ level, msg, ...extra }));

// Android par alag "channel": aaj wali deadline zor se (alag rang, full importance), baaki normal
const TODAY_TYPES = ['deadline_today', 'trial_today'];
const CHANNEL_TODAY = 'deadline_today';
const CHANNEL_DEFAULT = 'reminders';
// Paise / plan wali baatein sirf owner + manager ko
const MANAGER_ONLY = ['plan_expired', 'plan_expiring', 'low_stock'];

function isConfigured() {
  return !!cfg().firebase;
}

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const { firebase, googleTokenUrl } = cfg();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: firebase.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: googleTokenUrl, iat: now, exp: now + 3600 },
    firebase.privateKey, { algorithm: 'RS256' },
  );
  const res = await fetch(googleTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`google token: HTTP ${res.status} ${body.error || ''}`);
  tokenCache = { token: body.access_token, exp: Date.now() + (body.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

// FCM data mein sirf string values
function strData(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (v !== undefined && v !== null) out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  return out;
}

function buildMessage(token, { title, body, data, type }) {
  const today = TODAY_TYPES.includes(type);
  return {
    token,
    notification: { title, body: body || '' },
    data: strData({ ...data, type, click_action: 'FLUTTER_NOTIFICATION_CLICK' }),
    android: {
      priority: 'high',
      notification: {
        channel_id: today ? CHANNEL_TODAY : CHANNEL_DEFAULT,
        color: today ? '#C62828' : '#0F1E3D',
        sound: 'default',
        icon: 'ic_notification',
        tag: data && data.orderId ? `${type}:${data.orderId}` : undefined,
        notification_priority: today ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
        visibility: 'PUBLIC',
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', badge: 1, 'thread-id': today ? CHANNEL_TODAY : CHANNEL_DEFAULT } },
    },
  };
}

// Ek phone par bhejna. 'invalid' = token purana (app hata di / logout) — use mita do
async function sendOne(token, msg) {
  const { firebase, fcmBaseUrl } = cfg();
  const res = await fetch(`${fcmBaseUrl}/v1/projects/${firebase.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: buildMessage(token, msg) }),
  });
  if (res.ok) return 'sent';
  const err = await res.json().catch(() => ({}));
  const code = JSON.stringify(err);
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(code)) return 'invalid';
  if (res.status === 400 && /INVALID_ARGUMENT/.test(code) && /token/i.test(code)) return 'invalid';
  if (res.status === 401) tokenCache = { token: null, exp: 0 };
  throw new Error(`fcm: HTTP ${res.status} ${code.slice(0, 300)}`);
}

// In-app Notification document -> dukaan ke sahi logon ke saare phones
async function pushNotification(n) {
  if (!isConfigured() || !n || !n.shopId) return { sent: 0 };
  const { Shop, Session } = require('../models');
  const shop = await Shop.findOne({ _id: n.shopId, deletedAt: null }).select('members').lean();
  if (!shop) return { sent: 0 };
  let members = (shop.members || []).filter((m) => m.isActive);
  if (MANAGER_ONLY.includes(n.type)) members = members.filter((m) => m.role === 'owner' || m.role === 'manager');
  let userIds = members.map((m) => m.userId);
  if (n.userId) userIds = userIds.filter((u) => u === n.userId);
  if (!userIds.length) return { sent: 0 };

  const sessions = await Session.find({ userId: { $in: userIds }, revokedAt: null, expiresAt: { $gt: new Date() }, fcmToken: { $nin: [null, ''] } })
    .select('fcmToken').lean();
  const tokens = [...new Set(sessions.map((s) => s.fcmToken))];
  const msg = { title: n.title, body: n.body, type: n.type, data: { ...(n.data || {}), notificationId: n._id, shopId: n.shopId } };
  let sent = 0;
  for (const t of tokens) {
    try {
      const r = await sendOne(t, msg);
      if (r === 'sent') sent++;
      else await Session.updateMany({ fcmToken: t }, { $unset: { fcmToken: 1 } });
    } catch (e) {
      log('ERROR', 'push failed', { err: e.message, type: n.type });
    }
  }
  return { sent, devices: tokens.length };
}

// Test ke liye: config dobara padho
function _reset() {
  CFG = null;
  tokenCache = { token: null, exp: 0 };
}

module.exports = { pushNotification, isConfigured, buildMessage, CHANNEL_TODAY, CHANNEL_DEFAULT, TODAY_TYPES, _reset };
