// App admin (ADMIN_PHONES): plans, kisi dukaan ko plan dena, kamaai, tyohar
// Mount: /api/admin  —  Login + ADMIN_PHONES (app.js mein)
const express = require("express");
const adminController = require("../controller/admin.controller");

const router = express.Router();

router.get("/plans", adminController.getAllPlans);
router.post("/plans", adminController.createPlan);
router.patch("/plans/:id", adminController.updatePlan);
router.post("/shops/:shopId/subscription/grant", adminController.grantSubscription);
router.get("/subscription-payments", adminController.getAllSubscriptionPayments);
router.post("/festivals", adminController.createSystemFestival);

module.exports = router;
