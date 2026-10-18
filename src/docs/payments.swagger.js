// Swagger docs: /api/payments  (auto — routes/payments.routes.js ke saath)

/**
 * @swagger
 * /api/payments:
 *   post:
 *     tags: [payments]
 *     summary: Receive Payment
 *     description: " Order par:        {'customerId','orderId','amountPaise':50000,'mode':'upi'} \n  Udhaar jama:      {'customerId','amountPaise':100000,'mode':'cash'}  -> purane orders pehle (FIFO)"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/payments:
 *   get:
 *     tags: [payments]
 *     summary: Get Payments
 *     description: "Query: ?from=2026-10-01&to=2026-10-31&mode=upi&customerId="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/payments/{id}:
 *   delete:
 *     tags: [payments]
 *     summary: Delete Payment (owner/manager)
 *     description: "Body: (galat entry; order ka baaki apne aap theek)"
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/payments/dues:
 *   get:
 *     tags: [payments]
 *     summary: Get Dues
 *     description: "udhaar wale customers, sabse zyada pehle"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

