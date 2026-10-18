// Kharcha (expenses)
// Mount: /api/expenses  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const paymentController = require("../controller/payment.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", admin, paymentController.getExpenses);
router.post("/", admin, paymentController.createExpense);
router.delete("/:id", admin, paymentController.deleteExpense);

module.exports = router;
