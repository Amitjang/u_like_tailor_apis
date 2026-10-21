// Cloudinary photo helpers: thumbnail URL, public_id nikaalna, photo delete karna (jagah khaali).
const env = () => process.env;

const isOurs = (url) => {
  const cloud = env().CLOUDINARY_CLOUD_NAME;
  return typeof url === 'string' && !!cloud && url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`);
};

// ".../image/upload/v1712/uliketailor/shop1/image-1.jpg" -> "uliketailor/shop1/image-1"
function publicIdFromUrl(url) {
  if (!isOurs(url)) return null;
  const rest = url.split('/image/upload/')[1].split('?')[0];
  const parts = rest.split('/').filter((p) => p && !/^v\d+$/.test(p) && !p.includes(','));
  // transformation wale hisse (jaise "c_fill,w_300" ya "q_auto") hatao
  while (parts.length > 1 && /^[a-z]{1,3}_[^/]+$/.test(parts[0]) && !parts[0].startsWith('uliketailor')) parts.shift();
  if (!parts.length) return null;
  parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, '');
  return parts.join('/');
}

// Chhota version (list mein dikhane ke liye). Cloudinary khud banata hai — alag upload nahi.
function thumbUrl(url, size = 300) {
  if (!isOurs(url)) return url || null;
  return url.replace('/image/upload/', `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
}

// Cloudinary se photo hatao (best effort — fail ho to bhi aage badho)
async function destroy(urlOrId) {
  const id = urlOrId && urlOrId.includes('://') ? publicIdFromUrl(urlOrId) : urlOrId;
  if (!id || !env().CLOUDINARY_API_SECRET) return false;
  try {
    const cloudinary = require('../config/cloudinary');
    const r = await cloudinary.uploader.destroy(id, { invalidate: true });
    return r && (r.result === 'ok' || r.result === 'not found');
  } catch (e) {
    console.error(JSON.stringify({ level: 'WARN', msg: 'cloudinary destroy', id, err: e.message }));
    return false;
  }
}

// Photo badli / hatayi: purani Cloudinary se hatao. old = update se pehle ka record, set = naye fields
const PHOTO_KEYS = ['photoUrl', 'logoUrl'];
function dropReplacedPhotos(old, set) {
  if (!old || !set) return;
  for (const k of PHOTO_KEYS) {
    if (k in set && old[k] && old[k] !== set[k]) destroy(old[k]);
  }
}
const touchesPhoto = (set) => !!set && PHOTO_KEYS.some((k) => k in set);

module.exports = { publicIdFromUrl, thumbUrl, destroy, isOurs, dropReplacedPhotos, touchesPhoto, PHOTO_KEYS };
