// Swagger docs: /api/customers  (auto — routes/customers.routes.js ke saath)

/**
 * @swagger
 * /api/customers:
 *   get:
 *     tags: [customers]
 *     summary: Get Customers
 *     description: "Query: ?q=ram&tag=VIP&hasDue=true&sort=recent&limit=50&offset=0"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/customers:
 *   post:
 *     tags: [customers]
 *     summary: Create Customer
 *     description: "{'name':'Ramesh','phone':'98...','preferredLanguage':'hi','members':[{'name':'Ramesh','relation':'self'},{'name':'Aarav','relation':'son'}]} \n members na diye to ek 'self' member apne aap."
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/customers/lookup:
 *   get:
 *     tags: [customers]
 *     summary: Lookup Customer
 *     description: "Query: ?phone=98... — Body: (order lete waqt number daalte hi customer)"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/customers/{id}:
 *   get:
 *     tags: [customers]
 *     summary: Get Customer By Id
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
 * /api/customers/{id}:
 *   patch:
 *     tags: [customers]
 *     summary: Update Customer
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
 * /api/customers/{id}:
 *   delete:
 *     tags: [customers]
 *     summary: Delete Customer (owner/manager)
 *     description: "Query: ?force=true — Body: (udhaar baaki ho to force chahiye)"
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
 * /api/customers/{id}/members:
 *   post:
 *     tags: [customers]
 *     summary: Add Member
 *     description: "---------- Parivar ----------"
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
 * /api/customers/members/{memberId}:
 *   patch:
 *     tags: [customers]
 *     summary: Update Member
 *     parameters:
 *       - in: path
 *         name: memberId
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
 * /api/customers/members/{memberId}:
 *   delete:
 *     tags: [customers]
 *     summary: Delete Member
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/customers/members/{memberId}/measurements:
 *   get:
 *     tags: [customers]
 *     summary: Get Measurements
 *     description: "---------- Naap ---------- \n Query: ?history=true"
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/customers/members/{memberId}/measurements:
 *   post:
 *     tags: [customers]
 *     summary: Save Measurement
 *     description: "{'garmentTypeId','values':{'chest':38,'waist':32},'fitPreference':'regular','inputMethod':'voice','voiceTranscript':'...'} \n Purana naap history mein, naya 'current'."
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

