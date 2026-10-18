// Swagger docs: /api/admin  (auto — routes/admin.routes.js ke saath)

/**
 * @swagger
 * /api/admin/plans:
 *   get:
 *     tags: [admin]
 *     summary: Get All Plans
 *     description: "saare plans (band bhi) + kitni dukaanein us par hain"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/plans:
 *   post:
 *     tags: [admin]
 *     summary: Create Plan
 *     description: "Body: {'code':'pro_quarterly','tier':'pro','name':'Pro (3 months)','nameHi':'प्रो (3 महीने)','pricePaise':79900,'billingPeriod':'quarterly','limits':{...}}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/plans/{id}:
 *   patch:
 *     tags: [admin]
 *     summary: Update Plan
 *     description: "Body: {'pricePaise':15900} — nayi keemat sirf aage ki kharid par"
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
 * /api/admin/shops/{shopId}/subscription/grant:
 *   post:
 *     tags: [admin]
 *     summary: Grant Subscription
 *     description: "Body: {'planCode':'growth','amountPaise':0,'method':'cash','note':'launch offer'} \n amountPaise 0 = free (trial / promotion). Renew/upgrade ka niyam wahi jo online kharid ka."
 *     parameters:
 *       - in: path
 *         name: shopId
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
 * /api/admin/subscription-payments:
 *   get:
 *     tags: [admin]
 *     summary: Get All Subscription Payments
 *     description: "Query: ?status=paid&from=2026-10-01&to=2026-10-31"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/festivals:
 *   post:
 *     tags: [admin]
 *     summary: Create System Festival
 *     description: "Body: {'name':'Diwali','nameHi':'दिवाली','date':'2026-11-08','rushStartsDaysBefore':30} \n Sab dukaanon ko dikhte hain (har saal sahi tareekh ke saath bharein)"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

