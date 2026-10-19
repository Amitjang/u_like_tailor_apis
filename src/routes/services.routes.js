// Kapdon ke type ("services") + naap ke khaane + bol kar naap
// Mount: /api/services  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const serviceController = require("../controller/service.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", serviceController.getServices);
router.post("/", requirePerm("settings"), serviceController.createService);
router.post("/voice/parse", serviceController.parseVoice);
router.patch("/:id", requirePerm("settings"), serviceController.updateService);
router.put("/:id/fields", requirePerm("settings"), serviceController.updateServiceFields);

module.exports = router;
