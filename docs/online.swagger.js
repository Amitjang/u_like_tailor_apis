// Swagger docs: /api/online (shop app ki online booking)

/**
 * @swagger
 * /api/online/settings:
 *   get:
 *     tags: [online]
 *     summary: Get Settings
 *     description: "GET /api/online/settings"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/profile:
 *   put:
 *     tags: [online]
 *     summary: Put Profile
 *     description: "Body: {'enabled':true,'about':'...','categories':['gents'],'services':[{'name':'Shirt','fromPaise':45000}],'photos':['https://...'], 'homeVisit':false,'area':'Model Town','location':{'lat':30.37,'lng':76.78}} PUT /api/online/profile"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/hours:
 *   put:
 *     tags: [online]
 *     summary: Put Hours
 *     description: "Body: {'days':{'0':{'open':false},'1':{'open':true,'from':'11:00','to':'20:00'}},'breaks':[{'from':'14:00','to':'15:00'}], 'slotMinutes':30,'perSlot':2,'maxPerDay':8,'paused':false,'holidays':['2026-11-01'],'minLeadMinutes':60,'windowDays':30} PUT /api/online/hours"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/rules:
 *   put:
 *     tags: [online]
 *     summary: Put Rules
 *     description: "Body: {'autoConfirm':true,'advanceType':'fixed|pct|none','advanceValue':20000,'freeCancelHours':4,'maxReschedules':2,'responseHours':2,'autoOfferWaitlist':true} advanceValue: fixed = paise, pct = % PUT /api/online/rules"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/holidays:
 *   post:
 *     tags: [online]
 *     summary: Add Holidays
 *     description: "Body: {'dates':['2026-11-01','2026-11-02']} — chhutti jodo  |  DELETE /api/online/holidays/2026-11-01 POST /api/online/holidays"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/holidays/{date}:
 *   delete:
 *     tags: [online]
 *     summary: Remove Holiday
 *     description: "removeHoliday"
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/calendar:
 *   get:
 *     tags: [online]
 *     summary: Calendar
 *     description: "---------------------------------------------------------------- calendar Din ka view: har slot + uski bookings / band / khaali Query: ?date=2026-11-05&days=1 (max 7) GET /api/online/calendar"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/month:
 *   get:
 *     tags: [online]
 *     summary: Month
 *     description: "Mahine ka saar (calendar par rang): ?from=2026-11-01&days=31 GET /api/online/month"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/blocks:
 *   post:
 *     tags: [online]
 *     summary: Add Block
 *     description: "Body: {'date':'2026-11-05','time':'11:30','note':'walk-in'} POST /api/online/blocks"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/blocks/{id}:
 *   delete:
 *     tags: [online]
 *     summary: Remove Block
 *     description: "DELETE /api/online/blocks/:id  (khulte hi waitlist ko offer)"
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
 * /api/online/bookings:
 *   get:
 *     tags: [online]
 *     summary: List Bookings
 *     description: "---------------------------------------------------------------- bookings Query: ?view=pending|upcoming|today|past|all&date=2026-11-05&q= GET /api/online/bookings"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/bookings/{id}:
 *   get:
 *     tags: [online]
 *     summary: Get Booking
 *     description: "GET /api/online/bookings/:id"
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
 * /api/online/bookings/{id}/accept:
 *   post:
 *     tags: [online]
 *     summary: Accept
 *     description: "POST /api/online/bookings/:id/accept"
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
 * /api/online/bookings/{id}/decline:
 *   post:
 *     tags: [online]
 *     summary: Decline
 *     description: "Body: {'reason':'Fully booked that day'} POST /api/online/bookings/:id/decline"
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
 * /api/online/bookings/{id}/cancel:
 *   post:
 *     tags: [online]
 *     summary: Cancel
 *     description: "Dukaan ne confirm booking cancel ki (advance hamesha wapas) POST /api/online/bookings/:id/cancel"
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
 * /api/online/bookings/{id}/complete:
 *   post:
 *     tags: [online]
 *     summary: Complete
 *     description: "Customer aaya (naap ho gaya) — review dene ka mauka POST /api/online/bookings/:id/complete"
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
 * /api/online/bookings/{id}/no-show:
 *   post:
 *     tags: [online]
 *     summary: No Show
 *     description: "Customer nahi aaya (time nikal gaya ho tab) — advance dukaan ka POST /api/online/bookings/:id/no-show"
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
 * /api/online/bookings/{id}/advance-received:
 *   post:
 *     tags: [online]
 *     summary: Advance Received
 *     description: "Advance UPI par mil gaya / wapas kar diya POST /api/online/bookings/:id/advance-received   |   /advance-refunded"
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
 * /api/online/bookings/{id}/advance-refunded:
 *   post:
 *     tags: [online]
 *     summary: Advance Refunded
 *     description: "advanceRefunded"
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
 * /api/online/bookings/{id}/link-order:
 *   post:
 *     tags: [online]
 *     summary: Link Order
 *     description: "Booking se bana order jodo: {'orderId':'...'} POST /api/online/bookings/:id/link-order"
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
 * /api/online/waitlist:
 *   get:
 *     tags: [online]
 *     summary: List Waitlist
 *     description: "---------------------------------------------------------------- waitlist + reviews GET /api/online/waitlist?date="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/reviews:
 *   get:
 *     tags: [online]
 *     summary: List Reviews
 *     description: "GET /api/online/reviews"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/online/reviews/{id}/reply:
 *   post:
 *     tags: [online]
 *     summary: Reply Review
 *     description: "Body: {'text':'Thank you!'} (khaali = jawab hatao) POST /api/online/reviews/:id/reply"
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
