// upload.js

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
require("dotenv").config(); // ✅ load env

// 🔐 Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 📦 Cloudinary Storage Setup
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: "uploads", // 📁 folder in Cloudinary
      allowed_formats: ["jpg", "jpeg", "png"],
      public_id: `${file.fieldname}-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}`,
    };
  },
});

// ✅ File Filter (Safe)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    console.log("❌ Invalid file type:", file.mimetype);
    cb(null, false);
  }
};

// 🚀 Multer Upload Instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // ⚠️ 5MB limit
  },
});

module.exports = upload;