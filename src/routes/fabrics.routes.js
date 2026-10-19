// Kapda stock + entries
// Mount: /api/fabrics  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const fabricController = require("../controller/fabric.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", requirePerm("fabrics", "orders_create"), fabricController.getFabrics);
router.post("/", requirePerm("fabrics"), fabricController.createFabric);
router.patch("/:id", requirePerm("fabrics"), fabricController.updateFabric);
router.delete("/:id", admin, fabricController.deleteFabric);
router.get("/:id/transactions", requirePerm("fabrics"), fabricController.getFabricTransactions);
router.post("/:id/transactions", requirePerm("fabrics"), fabricController.addFabricTransaction);

module.exports = router;
