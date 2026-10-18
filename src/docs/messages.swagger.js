// Swagger docs: /api/messages  (auto — routes/messages.routes.js ke saath)

/**
 * @swagger
 * /api/messages/automation-rules:
 *   get:
 *     tags: [messages]
 *     summary: Get Automation Rules
 *     description: "har rule ke saath hi/en template"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/messages/automation-rules/{event}:
 *   put:
 *     tags: [messages]
 *     summary: Update Automation Rule (owner/manager)
 *     description: "Body: {'isEnabled':true,'offsetMinutes':-1440,'sendTimeLocal':'10:00','repeatEveryDays':7,'maxRepeats':3}"
 *     parameters:
 *       - in: path
 *         name: event
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
 * /api/messages/templates:
 *   get:
 *     tags: [messages]
 *     summary: Get Templates
 *     description: "Query: ?language=hi"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/messages/templates/{event}:
 *   put:
 *     tags: [messages]
 *     summary: Save Template (owner/manager)
 *     description: "Body: {'language':'en','body':'Hi {{customer_name}} ...'} \n Dukaan har bhasha ka apna message likh sakti hai. (Meta ke liye providerTemplateName approved hona chahiye.)"
 *     parameters:
 *       - in: path
 *         name: event
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
 * /api/messages:
 *   get:
 *     tags: [messages]
 *     summary: Get Messages (owner/manager)
 *     description: "Query: ?status=failed"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/messages/send:
 *   post:
 *     tags: [messages]
 *     summary: Send Message
 *     description: "Body: {'customerId','message':'Diwali offer: 10% off!'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

