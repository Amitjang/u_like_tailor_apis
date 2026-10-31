// Swagger docs: /api/market (customer app)

/**
 * @swagger
 * /api/market/shops:
 *   get:
 *     tags: [market]
 *     summary: Search Shops
 *     description: "---------------------------------------------------------------- browse (bina login) Query: ?lat=30.37&lng=76.78&radiusKm=15&q=sharma&category=ladies&city=Ambala&freeToday=1&sort=near|rating&limit=20&offset=0 GET /api/market/shops"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/shops/{id}:
 *   get:
 *     tags: [market]
 *     summary: Shop Page
 *     description: "GET /api/market/shops/:id"
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
 * /api/market/shops/{id}/slots:
 *   get:
 *     tags: [market]
 *     summary: Shop Slots
 *     description: "Query: ?from=2026-11-05&days=14 GET /api/market/shops/:id/slots"
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
 * /api/market/shops/{id}/reviews:
 *   get:
 *     tags: [market]
 *     summary: Shop Reviews
 *     description: "GET /api/market/shops/:id/reviews"
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
 * /api/market/me:
 *   get:
 *     tags: [market]
 *     summary: Get Me
 *     description: "---------------------------------------------------------------- me GET /api/market/me"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/me:
 *   patch:
 *     tags: [market]
 *     summary: Patch Me
 *     description: "Body: {'name':'Vishal Kumar','phone':'9876543210','whatsapp':true,'city':'Ambala'} PATCH /api/market/me"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/bookings:
 *   post:
 *     tags: [market]
 *     summary: Create Booking
 *     description: "---------------------------------------------------------------- booking Body: {'shopId','date':'2026-11-05','time':'12:30','purpose':'measurement','items':[{'garment':'Shirt','qty':2}], 'fabric':{'mode':'shop','fabricId':'...','meters':1.6} | {'mode':'own'},'notes':'...'} POST /api/market/bookings"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/bookings:
 *   get:
 *     tags: [market]
 *     summary: My Bookings
 *     description: "Query: ?scope=active|past GET /api/market/bookings"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/bookings/{id}:
 *   get:
 *     tags: [market]
 *     summary: My Booking
 *     description: "GET /api/market/bookings/:id"
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
 * /api/market/bookings/{id}/cancel:
 *   post:
 *     tags: [market]
 *     summary: Cancel Mine
 *     description: "Body: {'reason':'...'} POST /api/market/bookings/:id/cancel"
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
 * /api/market/bookings/{id}/reschedule:
 *   post:
 *     tags: [market]
 *     summary: Reschedule Mine
 *     description: "Body: {'date':'2026-11-07','time':'11:00'} POST /api/market/bookings/:id/reschedule"
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
 * /api/market/bookings/{id}/advance-paid:
 *   post:
 *     tags: [market]
 *     summary: Advance Paid
 *     description: "Customer: 'maine UPI se advance de diya' (dukaan check karke confirm karegi) Body: {'utr':'412345678901'} POST /api/market/bookings/:id/advance-paid"
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
 * /api/market/bookings/{id}/review:
 *   post:
 *     tags: [market]
 *     summary: Review Mine
 *     description: "Body: {'rating':5,'fitting':5,'onTime':4,'value':4,'text':'...','photos':['https://...']} POST /api/market/bookings/:id/review"
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
 * /api/market/waitlist:
 *   post:
 *     tags: [market]
 *     summary: Join Waitlist
 *     description: "---------------------------------------------------------------- waitlist Body: {'shopId','date','parts':['morning','evening'],'purpose','items'} POST /api/market/waitlist"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/waitlist:
 *   get:
 *     tags: [market]
 *     summary: My Waitlist
 *     description: "GET /api/market/waitlist"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/waitlist/{id}:
 *   delete:
 *     tags: [market]
 *     summary: Leave Waitlist
 *     description: "DELETE /api/market/waitlist/:id"
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
 * /api/market/notifications:
 *   get:
 *     tags: [market]
 *     summary: My Notifications
 *     description: "---------------------------------------------------------------- notifications GET /api/market/notifications"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/market/notifications/read-all:
 *   post:
 *     tags: [market]
 *     summary: Read All
 *     description: "POST /api/market/notifications/read-all"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */
