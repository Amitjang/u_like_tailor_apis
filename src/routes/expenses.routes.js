// Kharcha (expenses)
// Mount: /api/expenses  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const paymentController = require("../controller/payment.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", requirePerm("expenses"), paymentController.getExpenses);
router.post("/", requirePerm("expenses"), paymentController.createExpense);
router.delete("/:id", admin, paymentController.deleteExpense);

module.exports = router;
