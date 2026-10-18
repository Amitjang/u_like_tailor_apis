// WhatsApp message templates: "{{customer_name}}" jaise variables bharna.
const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

function render(body, vars) {
  return body.replace(VAR_RE, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

// Body se variables ki list (pehli baar aane ke kram mein)
function templateVars(body) {
  const out = [];
  for (const m of body.matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

// wa.me link: Free plan mein darzi tap karke khud bhejta hai
function shareUrl(phone, text) {
  return 'https://wa.me/' + String(phone).replace(/^\+/, '') + '?text=' + encodeURIComponent(text);
}

module.exports = { render, templateVars, shareUrl };
