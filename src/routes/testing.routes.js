// Sirf development: Cloudinary connection check (production mein band — app.js dekhein)
const express = require("express");
const router = express.Router();
const cloudinary = require("../config/cloudinary");

router.get("/test-cloudinary", async (req, res) => {
  try {

    const result = await cloudinary.api.ping();

    return res.status(200).json({
      success: true,
      message: "Cloudinary connected successfully",
      result,
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }
});
router.post("/test-upload", async (req, res) => {
  try {
    // Simulate an upload (you can replace this with actual file data)
    const result = await cloudinary.uploader.upload("https://via.placeholder.com/150");
    return res.status(200).json({
      success: true,
      message: "Upload successful",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
module.exports = router;