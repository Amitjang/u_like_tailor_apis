// Swagger docs: /api/festivals  (auto — routes/festivals.routes.js ke saath)

/**
 * @swagger
 * /api/festivals:
 *   get:
 *     tags: [festivals]
 *     summary: Get Festivals
 *     description: "Query: ?days=90 — aane wale tyohar (displayName bhasha mein) + orders"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/festivals:
 *   post:
 *     tags: [festivals]
 *     summary: Create Festival (owner/manager)
 *     description: "Body: {'name':'Wedding season','nameHi':'शादी का सीज़न','date':'2026-11-25','rushStartsDaysBefore':30}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/festivals/{id}/capacity:
 *   get:
 *     tags: [festivals]
 *     summary: Get Festival Capacity
 *     description: "Tyohar tak (kaam ke din × karigaron ki roz ki capacity) − pending kaam = aur kitne le sakte ho"
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

