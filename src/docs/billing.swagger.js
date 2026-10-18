// Swagger docs: /api/billing  (auto — routes/billing.routes.js ke saath)

/**
 * @swagger
 * /api/billing/preview:
 *   get:
 *     tags: [billing]
 *     summary: Preview Plan (owner)
 *     description: "Query: ?plan=pro_yearly"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/billing/checkout:
 *   post:
 *     tags: [billing]
 *     summary: Checkout (owner)
 *     description: "Body: {'planCode':'growth'}  (sirf owner)"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/billing/verify:
 *   post:
 *     tags: [billing]
 *     summary: Verify Payment (owner)
 *     description: "Body: {'razorpayOrderId','razorpayPaymentId','razorpaySignature'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/billing/payments:
 *   get:
 *     tags: [billing]
 *     summary: Get Subscription Payments (owner/manager)
 *     description: "Query: ?status=paid — kharid history + receipt (GST alag)"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

