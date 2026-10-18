// Kapdon ke type ("services") + naap ke khaane + bol kar naap
// Mount: /api/services  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const serviceController = require("../controller/service.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", serviceController.getServices);
router.post("/", admin, serviceController.createService);
router.post("/voice/parse", serviceController.parseVoice);
router.patch("/:id", admin, serviceController.updateService);
router.put("/:id/fields", admin, serviceController.updateServiceFields);

module.exports = router;
