// Offline sync (pull / push)
// Mount: /api/sync  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const syncController = require("../controller/sync.controller");

const router = express.Router();

router.post("/pull", syncController.pull);
router.post("/push", syncController.push);

module.exports = router;
