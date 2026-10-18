// WhatsApp: automatic rules, templates, bheje gaye messages, custom message
// Mount: /api/messages  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const messageController = require("../controller/message.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/automation-rules", messageController.getAutomationRules);
router.put("/automation-rules/:event", admin, messageController.updateAutomationRule);
router.get("/templates", messageController.getTemplates);
router.put("/templates/:event", admin, messageController.saveTemplate);
router.get("/", admin, messageController.getMessages);
router.post("/send", messageController.sendMessage);

module.exports = router;
