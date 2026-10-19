// Tyohar + capacity planner
// Mount: /api/festivals  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const dashboardController = require("../controller/dashboard.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", requirePerm("festivals"), dashboardController.getFestivals);
router.post("/", admin, dashboardController.createFestival);
router.get("/:id/capacity", requirePerm("festivals"), dashboardController.getFestivalCapacity);

module.exports = router;
