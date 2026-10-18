// Swagger docs: /api/fabrics  (auto — routes/fabrics.routes.js ke saath)

/**
 * @swagger
 * /api/fabrics:
 *   get:
 *     tags: [fabrics]
 *     summary: Get Fabrics
 *     description: "Query: ?q=cotton&lowStock=true"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/fabrics:
 *   post:
 *     tags: [fabrics]
 *     summary: Create Fabric
 *     description: "Body: {'name':'Raymond Cotton','color':'White','initialQty':25,'costPerUnitPaise':18000} \n initialQty se pehli 'purchase' entry apne aap"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/fabrics/{id}:
 *   patch:
 *     tags: [fabrics]
 *     summary: Update Fabric
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
 * /api/fabrics/{id}:
 *   delete:
 *     tags: [fabrics]
 *     summary: Delete Fabric (owner/manager)
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
 * /api/fabrics/{id}/transactions:
 *   get:
 *     tags: [fabrics]
 *     summary: Get Fabric Transactions
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
 * /api/fabrics/{id}/transactions:
 *   post:
 *     tags: [fabrics]
 *     summary: Add Fabric Transaction
 *     description: "Body: {'txnType':'purchase','quantity':20,'unitCostPaise':18000} \n 'used'/'sold' mein quantity positive bhejein, server minus kar dega"
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

