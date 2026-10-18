// Swagger docs: /api/sync  (auto — routes/sync.routes.js ke saath)

/**
 * @swagger
 * /api/sync/pull:
 *   post:
 *     tags: [sync]
 *     summary: Pull
 *     description: "Body: {'sinceSeq':0,'deviceId':'abc','limit':500}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/sync/push:
 *   post:
 *     tags: [sync]
 *     summary: Push
 *     description: "Body: {'deviceId':'abc','changes':{'customers':[{'id','name','phone','members':[...],'updatedAt'}],'orders':[...]}}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

