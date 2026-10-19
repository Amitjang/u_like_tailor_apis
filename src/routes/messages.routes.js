// WhatsApp: automatic rules, templates, bheje gaye messages, custom message
// Mount: /api/messages  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const messageController = require("../controller/message.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/automation-rules", requirePerm("whatsapp"), messageController.getAutomationRules);
router.put("/automation-rules/:event", requirePerm("whatsapp"), messageController.updateAutomationRule);
router.get("/templates", requirePerm("whatsapp"), messageController.getTemplates);
router.put("/templates/:event", requirePerm("whatsapp"), messageController.saveTemplate);
router.get("/", requirePerm("whatsapp"), messageController.getMessages);
router.post("/send", requirePerm("whatsapp", "orders_edit"), messageController.sendMessage);

module.exports = router;
