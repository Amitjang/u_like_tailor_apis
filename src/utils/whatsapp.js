// WhatsApp bhejna. Naya provider (Gupshup, Interakt...) lagana ho to bas
// { name, sendTemplate(), sendOtp() } wala object banao.
const crypto = require('crypto');

// Development: sirf console par print
const logWhatsApp = {
  name: 'log',
  async sendTemplate({ to, templateName, lang, params, text }) {
    console.log(JSON.stringify({ level: 'INFO', msg: 'WHATSAPP (log)', to, templateName, lang, params, text }));
    return 'log-' + crypto.randomUUID();
  },
  async sendOtp({ to, lang, otp }) {
    console.log(JSON.stringify({ level: 'INFO', msg: 'OTP (log)', to, lang, otp }));
  },
};

// Meta WhatsApp Cloud API
function metaCloud({ phoneNumberId, accessToken, apiVersion }) {
  async function post(body) {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`whatsapp api ${res.status}: ${raw.slice(0, 500)}`);
    const out = JSON.parse(raw);
    if (!out.messages || !out.messages[0]) throw new Error('whatsapp api: unexpected response: ' + raw.slice(0, 300));
    return out.messages[0].id;
  }
  return {
    name: 'meta_cloud',
    // templateName khaali ho to plain text (Meta par sirf 24 ghante ki window mein chalta hai)
    async sendTemplate({ to, templateName, lang, params = [], text }) {
      const base = { messaging_product: 'whatsapp', to: String(to).replace(/^\+/, '') };
      if (templateName) {
        const components = params.length
          ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : [];
        return post({ ...base, type: 'template', template: { name: templateName, language: { code: lang }, components } });
      }
      return post({ ...base, type: 'text', text: { body: text, preview_url: true } });
    },
    // WhatsApp "Authentication" template (copy-code button). Har bhasha ka template alag approve hota hai.
    async sendOtp({ to, templateName, lang, otp }) {
      await post({
        messaging_product: 'whatsapp', to: String(to).replace(/^\+/, ''), type: 'template',
        template: {
          name: templateName, language: { code: lang },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: otp }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
          ],
        },
      });
    },
  };
}

function fromConfig(cfg) {
  if (cfg.waProvider === 'meta_cloud') {
    return metaCloud({ phoneNumberId: cfg.waPhoneNumberId, accessToken: cfg.waAccessToken, apiVersion: cfg.waApiVersion });
  }
  return logWhatsApp;
}

module.exports = { logWhatsApp, metaCloud, fromConfig };
