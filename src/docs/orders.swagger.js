// Swagger docs: /api/orders  (auto — routes/orders.routes.js ke saath)

/**
 * @swagger
 * /api/orders:
 *   post:
 *     tags: [orders]
 *     summary: Create Order
 *     description: "{'customerId','trialDate','promisedDeliveryDate','items':[{'memberId','garmentTypeId','quantity':2,'ratePaise':80000, \n   'fabricSource':'shop','fabricId','fabricQtyUsed':6,'designNotes':'chinese collar'}], \n  'discountPaise':10000,'advance':{'amountPaise':100000,'mode':'upi'},'sendWhatsApp':true}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [orders]
 *     summary: Get Orders
 *     description: "Query: ?status=received,stitching&from=&to=&customerId=&q=&late=true&due=true&urgent=true&festivalId=&sort=recent"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     tags: [orders]
 *     summary: Get Order By Id
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
 * /api/orders/{id}:
 *   patch:
 *     tags: [orders]
 *     summary: Update Order
 *     description: "Body: {trialDate, promisedDeliveryDate, isUrgent, notes, discountPaise, taxPaise, festivalId}"
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
 * /api/orders/{id}/status:
 *   post:
 *     tags: [orders]
 *     summary: Update Order Status
 *     description: "Body: {'status':'ready','itemId':null,'note':''}"
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
 * /api/orders/scan/{qr}:
 *   post:
 *     tags: [orders]
 *     summary: Scan Qr
 *     description: "Body: {'status':'stitching'} — order tag ka QR scan (status na do to sirf jaankari)"
 *     parameters:
 *       - in: path
 *         name: qr
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
 * /api/orders/{id}/notify:
 *   post:
 *     tags: [orders]
 *     summary: Notify Customer
 *     description: "Body: {'event':'payment_due'} — manual 'WhatsApp bhejo'"
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
 * /api/orders/items/{itemId}:
 *   patch:
 *     tags: [orders]
 *     summary: Update Order Item
 *     description: "Body: {quantity, ratePaise, designId, designNotes, trialDate, deliveryDate}"
 *     parameters:
 *       - in: path
 *         name: itemId
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
 * /api/orders/{id}/payment-link:
 *   post:
 *     tags: [orders]
 *     summary: Create Payment Link
 *     description: "Body: {'amountPaise'} (na do to poora baaki) \n WhatsApp mein upi:// click nahi hota — customer tracking link par 'Pay' button se yahi khulta hai."
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
 * /api/orders/items/{itemId}/assign:
 *   post:
 *     tags: [orders]
 *     summary: Assign Work
 *     description: "Body: {'staffId','task':'stitching','quantity':1,'dueDate':'2026-10-08'} \n ratePaise na do to piece-rate table se apne aap"
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

