// App config (version / force update / links): DB ka document, khaali fields par .env ke default.
const i18n = require('./i18n');

// "1.10.2" > "1.9.9" (numbers se, "+build" hissa chhod kar)
function compareVersions(a, b) {
  const pa = String(a || '0').split('+')[0].split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('+')[0].split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function defaults() {
  const e = process.env;
  // PRIVACY_URL / TERMS_URL na ho to apne server ke pages (/privacy, /terms)
  const base = String(e.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const own = base && !/localhost|127\.0\.0\.1/.test(base) ? base : '';
  return {
    privacyUrl: e.PRIVACY_URL || (own ? `${own}/privacy` : ''),
    termsUrl: e.TERMS_URL || (own ? `${own}/terms` : ''),
    android: { storeUrl: e.ANDROID_STORE_URL || 'https://play.google.com/store/apps/details?id=com.uLikeTailor.u_like_tailor' },
    ios: { storeUrl: e.IOS_STORE_URL || '' },
  };
}

// DB doc -> app ke liye (platform + current version ke hisaab se)
function forApp(doc, { platform, version, lang }) {
  const d = defaults();
  const c = doc || {};
  const pl = platform === 'ios' ? 'ios' : 'android';
  const p = { latestVersion: '1.0.0', minVersion: '1.0.0', storeUrl: '', ...(c[pl] || {}) };
  const storeUrl = p.storeUrl || d[pl].storeUrl;
  const current = version || '0.0.0';
  const belowMin = compareVersions(current, p.minVersion) < 0;
  const belowLatest = compareVersions(current, p.latestVersion) < 0;
  return {
    platform: pl,
    currentVersion: current,
    latestVersion: p.latestVersion,
    minVersion: p.minVersion,
    updateAvailable: belowLatest,
    updateRequired: belowMin || (!!c.forceUpdate && belowLatest),
    message: i18n.pick(lang, c.message || '', c.messageHi || '') || i18n.t(lang, 'update_default_message'),
    storeUrl,
    privacyUrl: c.privacyUrl || d.privacyUrl,
    termsUrl: c.termsUrl || d.termsUrl,
  };
}

module.exports = { compareVersions, forApp, defaults };
