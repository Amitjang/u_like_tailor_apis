// Swagger docs: /api/media  (auto — routes/media.routes.js ke saath)

/**
 * @swagger
 * /api/media/designs:
 *   get:
 *     tags: [media]
 *     summary: Get Designs
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/media/designs:
 *   post:
 *     tags: [media]
 *     summary: Create Design
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/media/designs/{id}:
 *   patch:
 *     tags: [media]
 *     summary: Update Design
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/media/designs/{id}:
 *   delete:
 *     tags: [media]
 *     summary: Delete Design
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
 * /api/media:
 *   get:
 *     tags: [media]
 *     summary: Get Media
 *     description: "Query: ?entityType=order&entityId=..."
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/media:
 *   post:
 *     tags: [media]
 *     summary: Create Media
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/media/{id}:
 *   delete:
 *     tags: [media]
 *     summary: Delete Media
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

