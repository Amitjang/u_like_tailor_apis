// Payments + udhaar (dues)
// Mount: /api/payments  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const paymentController = require("../controller/payment.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.post("/", requirePerm("payments"), paymentController.receivePayment);
router.get("/", requirePerm("payments"), paymentController.getPayments);
router.get("/dues", requirePerm("payments"), paymentController.getDues);
router.delete("/:id", admin, paymentController.deletePayment);

module.exports = router;
