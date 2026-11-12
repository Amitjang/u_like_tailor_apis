// Plan kharidna (Razorpay): preview, checkout, verify, history
// Mount: /api/billing  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const billingController = require("../controller/billing.controller");

const { billingEnabled } = require("../utils/plans");
const { ApiError } = require("../utils/http.helpers");

const router = express.Router();
const admin = requireRole("owner", "manager");
const owner = requireRole("owner");

// Payment abhi band (BILLING_ENABLED=true nahi) -> plan kharidna band, sab free.
// Payment shuru karni ho to sirf Render mein BILLING_ENABLED=true — ye code jaisa tha waisa chalega.
const billingOn = (req, res, next) => (billingEnabled() ? next() : next(new ApiError(403, "billing_off", "billing_off")));

router.get("/preview", owner, billingOn, billingController.previewPlan);
router.post("/checkout", owner, billingOn, billingController.checkout);
router.post("/verify", owner, billingOn, billingController.verifyPayment);
router.get("/payments", admin, billingController.getSubscriptionPayments);

module.exports = router;
