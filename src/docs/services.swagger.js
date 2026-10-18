// Swagger docs: /api/services  (auto — routes/services.routes.js ke saath)

/**
 * @swagger
 * /api/services:
 *   get:
 *     tags: [services]
 *     summary: Get Services
 *     description: "Body: (system + dukaan ke apne, naap ke khaanon ke saath)"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/services:
 *   post:
 *     tags: [services]
 *     summary: Create Service (owner/manager)
 *     description: "{'code':'sherwani','name':'Sherwani','nameHi':'शेरवानी','fields':[{'key':'chest','label':'Chest','labelHi':'छाती','voiceAliases':['chhati']}]}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/services/{id}:
 *   patch:
 *     tags: [services]
 *     summary: Update Service (owner/manager)
 *     description: "Body: (sirf dukaan ke apne; system wale nahi)"
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
 * /api/services/{id}/fields:
 *   put:
 *     tags: [services]
 *     summary: Update Service Fields (owner/manager)
 *     description: "Body: {'fields':[...]} — poori list replace"
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
 * /api/services/voice/parse:
 *   post:
 *     tags: [services]
 *     summary: Parse Voice
 *     description: "Body: {'garmentTypeId','transcript':'chhati 38 aur aadha, kamar 32'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

