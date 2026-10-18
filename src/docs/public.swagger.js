// Swagger docs: /api/public  (auto — routes/public.routes.js ke saath)

/**
 * @swagger
 * /api/public/languages:
 *   get:
 *     tags: [public]
 *     summary: Get Languages
 *     description: "bhasha chunne wali screen"
 *     security: []
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/public/plans:
 *   get:
 *     tags: [public]
 *     summary: Get Plans
 *     description: "pricing screen (bhasha mein; keemat GST ke saath) \n pricePerMonthPaise aur savingsPaise (saalana par bachat) app seedha dikha sakta hai"
 *     security: []
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/public/track/{token}:
 *   get:
 *     tags: [public]
 *     summary: Track Order
 *     description: "Query: ?lang=en — customer bina app ke apna order dekhta hai. \n Bhasha: ?lang / X-Language, warna customer ki apni. Phone ya naap yahan nahi dikhta."
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/public/shops/{shopId}/catalog:
 *   get:
 *     tags: [public]
 *     summary: Get Catalog
 *     description: "dukaan ke public designs"
 *     security: []
 *     parameters:
 *       - in: path
 *         name: shopId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

