// Kapda stock + entries
// Mount: /api/fabrics  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const fabricController = require("../controller/fabric.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", fabricController.getFabrics);
router.post("/", fabricController.createFabric);
router.patch("/:id", fabricController.updateFabric);
router.delete("/:id", admin, fabricController.deleteFabric);
router.get("/:id/transactions", fabricController.getFabricTransactions);
router.post("/:id/transactions", fabricController.addFabricTransaction);

module.exports = router;
