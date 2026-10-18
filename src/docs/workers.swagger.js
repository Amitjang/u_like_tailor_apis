// Swagger docs: /api/workers  (auto — routes/workers.routes.js ke saath)

/**
 * @swagger
 * /api/workers:
 *   get:
 *     tags: [workers]
 *     summary: Get Workers
 *     description: "Query: ?active=true"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/workers:
 *   post:
 *     tags: [workers]
 *     summary: Create Worker (owner/manager)
 *     description: "Body: {'name':'Salim','phone':'98..','role':'karigar','payType':'piece_rate'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/workers/{id}:
 *   patch:
 *     tags: [workers]
 *     summary: Update Worker (owner/manager)
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
 * /api/workers/{id}:
 *   delete:
 *     tags: [workers]
 *     summary: Delete Worker (owner/manager)
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
 * /api/workers/earnings:
 *   get:
 *     tags: [workers]
 *     summary: Get Earnings (owner/manager)
 *     description: "sab karigaron ka baaki hisaab"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/workers/{id}/capacity:
 *   put:
 *     tags: [workers]
 *     summary: Set Capacity (owner/manager)
 *     description: "Body: {'items':[{'garmentTypeId','piecesPerDay':3}]} (0 = hatao)"
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
 * /api/workers/assignments/{id}:
 *   patch:
 *     tags: [workers]
 *     summary: Update Assignment
 *     description: "Body: {'status':'done'} — payment ho chuka kaam badla nahi ja sakta"
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
 * /api/workers/{id}/work:
 *   get:
 *     tags: [workers]
 *     summary: Get Work
 *     description: "Query: ?status=assigned,in_progress&unpaid=true — Body: (staff sirf apna)"
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
 * /api/workers/{id}/advances:
 *   post:
 *     tags: [workers]
 *     summary: Give Advance (owner/manager)
 *     description: "Body: {'amountPaise':200000,'mode':'cash'}"
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
 * /api/workers/{id}/payouts:
 *   get:
 *     tags: [workers]
 *     summary: Get Payouts (owner/manager)
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
 * /api/workers/{id}/payouts:
 *   post:
 *     tags: [workers]
 *     summary: Create Payout (owner/manager)
 *     description: "Body: {'periodEnd':'2026-10-05','fixedEarningsPaise':0,'bonusPaise':0,'mode':'cash','dryRun':true} \n periodEnd tak ke saare 'done' kaam aur advance jod-ghata kar hisaab."
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
 * /api/workers/piece-rates:
 *   get:
 *     tags: [workers]
 *     summary: Get Piece Rates (owner/manager)
 *     description: "---------- Piece rate ----------"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/workers/piece-rates:
 *   put:
 *     tags: [workers]
 *     summary: Set Piece Rate (owner/manager)
 *     description: "Body: {'garmentTypeId','task':'stitching','ratePaise':15000,'staffId':null,'effectiveFrom':'2026-10-01'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/workers/attendance:
 *   get:
 *     tags: [workers]
 *     summary: Get Attendance
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/workers/attendance:
 *   put:
 *     tags: [workers]
 *     summary: Save Attendance (owner/manager)
 *     description: "Body: {'date':'2026-10-03','entries':[{'staffId','status':'present'}]}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

