// Dashboard ("aaj ka kaam") + mahine ki report
// Mount: /api/dashboard  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const dashboardController = require("../controller/dashboard.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", dashboardController.getDashboard);
router.get("/reports/monthly", requirePerm("reports"), dashboardController.getMonthlyReport);

module.exports = router;
