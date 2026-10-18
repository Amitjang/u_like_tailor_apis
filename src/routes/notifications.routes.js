// In-app notifications
// Mount: /api/notifications  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const messageController = require("../controller/message.controller");

const router = express.Router();

router.get("/", messageController.getNotifications);
router.post("/read", messageController.markNotificationsRead);

module.exports = router;
