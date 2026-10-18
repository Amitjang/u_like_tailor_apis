// Swagger docs: /api/webhooks  (auto — routes/webhooks.routes.js ke saath)

/**
 * @swagger
 * /api/webhooks/whatsapp:
 *   get:
 *     tags: [webhooks]
 *     summary: Whatsapp Verify
 *     description: "Meta dashboard verify karta hai"
 *     security: []
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/webhooks/whatsapp:
 *   post:
 *     tags: [webhooks]
 *     summary: Whatsapp Status
 *     description: "sent / delivered / read / failed"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/webhooks/razorpay:
 *   post:
 *     tags: [webhooks]
 *     summary: Razorpay Webhook
 *     description: "Razorpay dashboard mein yeh URL + secret. \n Events: payment.captured, order.paid, payment.failed"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

