// Plan kharidna (Razorpay): preview, checkout, verify, history
// Mount: /api/billing  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const billingController = require("../controller/billing.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");
const owner = requireRole("owner");

router.get("/preview", owner, billingController.previewPlan);
router.post("/checkout", owner, billingController.checkout);
router.post("/verify", owner, billingController.verifyPayment);
router.get("/payments", admin, billingController.getSubscriptionPayments);

module.exports = router;
