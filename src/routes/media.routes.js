// Design catalog + photos (Cloudinary upload)
// Mount: /api/media  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const fabricController = require("../controller/fabric.controller");
const uploadController = require("../controller/upload.controller");
const upload = require("../config/mutler");

const router = express.Router();

router.get("/designs", fabricController.getDesigns);
router.post("/designs", fabricController.createDesign);
router.patch("/designs/:id", fabricController.updateDesign);
router.delete("/designs/:id", fabricController.deleteDesign);
// Photo upload (Cloudinary): form-data "image" -> {url}
router.post("/upload", uploadController.requireUploadConfig, upload.single("image"), uploadController.uploadErrors, uploadController.uploadPhoto);
router.get("/", fabricController.getMedia);
router.post("/", fabricController.createMedia);
router.delete("/:id", fabricController.deleteMedia);

module.exports = router;
