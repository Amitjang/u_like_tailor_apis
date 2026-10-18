// Webhooks: WhatsApp status, Razorpay payment
// Mount: /api/webhooks  —  Bina login (signature check controller mein)
const express = require("express");
const webhookController = require("../controller/webhook.controller");

const router = express.Router();

router.get("/whatsapp", webhookController.whatsappVerify);
router.post("/whatsapp", webhookController.whatsappStatus);
router.post("/razorpay", webhookController.razorpayWebhook);

module.exports = router;
