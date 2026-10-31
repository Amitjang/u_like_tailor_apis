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

/**
 * @swagger
 * /api/admin/app-config:
 *   get:
 *     tags: [admin]
 *     summary: App config dekho
 *     description: ""
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/app-config:
 *   put:
 *     tags: [admin]
 *     summary: Naya version / force update
 *     description: "Body: {'android':{'latestVersion','minVersion','storeUrl'},'ios':{...},'forceUpdate':true,'message','messageHi','privacyUrl','termsUrl'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/me:
 *   get:
 *     tags: [admin]
 *     summary: Who am I (admin role)
 *     description: "role owner = full access, support = view only"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [admin]
 *     summary: Dashboard
 *     description: "Shops, users, orders, revenue, MRR, plan mix, 30-day signups, 6-month revenue, expiring plans"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/shops:
 *   get:
 *     tags: [admin]
 *     summary: List shops
 *     description: "Query: ?q=&tier=free|growth|pro&status=active|blocked|expired|deleted|verified&city=&sort=new|old|name&limit&offset"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/shops/{id}:
 *   get:
 *     tags: [admin]
 *     summary: Shop detail
 *     description: "Owner, team, plan, usage vs limits, stats, plan payments, recent orders, admin log"
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
 * /api/admin/shops/{id}:
 *   patch:
 *     tags: [admin]
 *     summary: Update shop
 *     description: "Body: {'blocked':true,'blockedReason':'...'} | {'verified':true} | {'adminNote':'...'} | {'name','phone','city',...}"
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
 * /api/admin/shops/{id}/subscription/extend:
 *   post:
 *     tags: [admin]
 *     summary: Extend paid plan
 *     description: "Body: {'days':30}"
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
 * /api/admin/shops/{id}/subscription/cancel:
 *   post:
 *     tags: [admin]
 *     summary: Move shop to Free now
 *     description: ""
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
 * /api/admin/shops/{id}/delete:
 *   post:
 *     tags: [admin]
 *     summary: Soft delete shop
 *     description: ""
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
 * /api/admin/shops/{id}/restore:
 *   post:
 *     tags: [admin]
 *     summary: Restore deleted shop
 *     description: ""
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
 * /api/admin/users:
 *   get:
 *     tags: [admin]
 *     summary: List users
 *     description: "Query: ?q=&status=active|blocked&type=social|password|phone"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [admin]
 *     summary: User detail
 *     description: "Shops + logged-in devices"
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
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [admin]
 *     summary: Block / unblock user
 *     description: "Body: {'isActive':false} — also logs out every device"
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
 * /api/admin/users/{id}/logout-all:
 *   post:
 *     tags: [admin]
 *     summary: Log user out everywhere
 *     description: ""
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
 * /api/admin/subscription-payments:
 *   get:
 *     tags: [admin]
 *     summary: Plan payments
 *     description: "Query: ?status=paid&gateway=razorpay&plan=pro&from=2026-10-01&to=2026-10-31&q="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/subscription-payments.csv:
 *   get:
 *     tags: [admin]
 *     summary: Plan payments CSV
 *     description: "Same filters as the list"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/subscription-payments/{id}/mark-refunded:
 *   post:
 *     tags: [admin]
 *     summary: Mark payment refunded
 *     description: "Body: {'note':'refunded on Razorpay'} — record only"
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
 * /api/admin/marketplace-settings:
 *   get:
 *     tags: [admin]
 *     summary: Marketplace settings
 *     description: "Commission, growth features (on/off + plans), booking rules"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/marketplace-settings:
 *   put:
 *     tags: [admin]
 *     summary: Save marketplace settings
 *     description: "Body: {'commission':{'enabled':true,'stitchingPct':8},'features':{'deals':{'enabled':true,'plans':['growth','pro']}},'rules':{'maxAdvancePct':25}}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/broadcast:
 *   post:
 *     tags: [admin]
 *     summary: Notify shops
 *     description: "Body: {'title','body','target':'all|tier|city|shops','tier','city','shopIds':[],'dryRun':true}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/broadcasts:
 *   get:
 *     tags: [admin]
 *     summary: Broadcast history
 *     description: ""
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/festivals:
 *   get:
 *     tags: [admin]
 *     summary: India-wide festivals
 *     description: ""
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/festivals/{id}:
 *   delete:
 *     tags: [admin]
 *     summary: Delete festival
 *     description: ""
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
 * /api/admin/admins:
 *   get:
 *     tags: [admin]
 *     summary: List admins
 *     description: ".env admins + panel admins"
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/admins:
 *   post:
 *     tags: [admin]
 *     summary: Add admin
 *     description: "Body: {'email','name','role':'owner|support'} — they sign in with Google using this email"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/admins/{id}:
 *   patch:
 *     tags: [admin]
 *     summary: Update admin
 *     description: "Body: {'role'} | {'isActive':false}"
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
 * /api/admin/admins/{id}:
 *   delete:
 *     tags: [admin]
 *     summary: Remove admin
 *     description: ""
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
 * /api/admin/audit-log:
 *   get:
 *     tags: [admin]
 *     summary: Audit log
 *     description: "Every change made in the admin panel. Query: ?q=&targetId="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/bookings:
 *   get:
 *     tags: [admin]
 *     summary: Customer app bookings
 *     description: "Query: ?status=&from=&to=&shopId=&q="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/reviews:
 *   get:
 *     tags: [admin]
 *     summary: Reviews
 *     description: "Query: ?hidden=1|0&rating=&q="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/admin/reviews/{id}:
 *   patch:
 *     tags: [admin]
 *     summary: Hide / show review
 *     description: "Body: {'hidden':true,'reason':'abusive'}"
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
