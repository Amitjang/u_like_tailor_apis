// Swagger docs: /api/notifications  (auto — routes/notifications.routes.js ke saath)

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [notifications]
 *     summary: Get Notifications
 *     description: "Query: ?unread=true"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/notifications/read:
 *   post:
 *     tags: [notifications]
 *     summary: Mark Notifications Read
 *     description: "Body: {'ids':[...]} ya {'all':true}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

