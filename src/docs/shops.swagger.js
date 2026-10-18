// Swagger docs: /api/shops  (auto — routes/shops.routes.js ke saath)

/**
 * @swagger
 * /api/shops:
 *   get:
 *     tags: [shops]
 *     summary: Get My Shops
 *     description: "meri dukaanein"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops:
 *   post:
 *     tags: [shops]
 *     summary: Create Shop
 *     description: "defaultLanguage na do to user ki app-bhasha. Free plan apne aap."
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops/current:
 *   get:
 *     tags: [shops]
 *     summary: Get Shop
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops/current:
 *   patch:
 *     tags: [shops]
 *     summary: Update Shop (owner/manager)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops/subscription:
 *   get:
 *     tags: [shops]
 *     summary: Get Subscription
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops/team:
 *   get:
 *     tags: [shops]
 *     summary: Get Team (owner/manager)
 *     description: "---------- Team (app login wale log) ----------"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops/team:
 *   post:
 *     tags: [shops]
 *     summary: Add Team Member (owner)
 *     description: "Body: {'phone','name','role':'manager'|'staff','preferredLanguage'} — Pro plan"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/shops/team/{memberId}:
 *   delete:
 *     tags: [shops]
 *     summary: Remove Team Member (owner)
 *     description: "Body: (owner ko hataya nahi ja sakta)"
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

