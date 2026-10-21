// Photo upload (Cloudinary). Form-data field "image" (jpg/png, max 5 MB).
// Jawab: {url} — yeh URL customer.photoUrl / media.url / shop.logoUrl mein daalein.
const { h, created, bad, ApiError } = require('../utils/http.helpers');
const { thumbUrl } = require('../utils/cloud_media');

const configured = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Multer ko tabhi chalao jab Cloudinary set ho (warna saaf message)
const requireUploadConfig = (req, res, next) => {
  if (!configured()) return next(new ApiError(503, 'upload_not_configured', 'upload_not_configured'));
  next();
};

// POST /api/media/upload
const uploadPhoto = h(async (req, res) => {
  if (!req.file) throw bad('upload_file_required');
  created(res, { url: req.file.path, thumbnailUrl: thumbUrl(req.file.path), publicId: req.file.filename, mimeType: req.file.mimetype, sizeBytes: req.file.size });
});

// Multer / Cloudinary ki galti ko API error mein
const uploadErrors = (err, req, res, next) => {
  if (!err) return next();
  if (err instanceof ApiError) return next(err);
  next(bad('upload_failed', err.message || String(err)));
};

module.exports = { requireUploadConfig, uploadPhoto, uploadErrors };
