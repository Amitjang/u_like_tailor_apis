// Swagger docs: /api/auth  (auto — routes/auth.routes.js ke saath)

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     tags: [auth]
 *     summary: Google Login
 *     description: "Body: {'idToken','deviceId','deviceName','appVersion','fcmToken'} -> {tokens,isNewUser,needsPhone,me}"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/apple:
 *   post:
 *     tags: [auth]
 *     summary: Apple Login
 *     description: "Body: {'idToken','name'(sirf pehli baar),'deviceId','deviceName','appVersion','fcmToken'} -> {tokens,isNewUser,needsPhone,me}"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/phone/send-otp:
 *   post:
 *     tags: [auth]
 *     summary: Phone jodne ka OTP
 *     description: "Body: {'phone'} (login zaroori)"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/phone/verify:
 *   post:
 *     tags: [auth]
 *     summary: Phone jodna (OTP)
 *     description: "Body: {'phone','otp','deviceId','fcmToken'} -> {merged,me,tokens?}. merged=true: staff ka account mil gaya, naye tokens save karein"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/fcm-token:
 *   post:
 *     tags: [auth]
 *     summary: Push token save
 *     description: "Body: {'fcmToken'} (Firebase token badle to)"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/otp/send:
 *   post:
 *     tags: [auth]
 *     summary: Send Otp
 *     description: "Body: {'phone':'9876543210'}  (X-Language ki bhasha mein OTP)"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/otp/verify:
 *   post:
 *     tags: [auth]
 *     summary: Verify Otp
 *     description: "Body: {'phone','otp','deviceId','deviceName','appVersion','fcmToken'}"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [auth]
 *     summary: Refresh Token
 *     description: "Body: {'refreshToken'} — har baar naya refresh token (purana band)"
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [auth]
 *     summary: Logout
 *     description: "Body: {'allDevices': false}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [auth]
 *     summary: Get Profile
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     tags: [auth]
 *     summary: Update Profile
 *     description: "Body: {'name','preferredLanguage':'hi'|'en'} — bhasha isi response se lagu"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

