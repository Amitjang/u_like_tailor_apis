// App admin (web Admin Panel): sab dukaanein, users, plans, payments, marketplace settings, broadcast, admins
// Mount: /api/admin  —  Login + admin (ADMIN_EMAILS / ADMIN_PHONES ya panel ka AdminUser) — app.js mein
// Har badlav (GET ke alawa) audit log mein jaata hai.
const express = require("express");
const adminController = require("../controller/admin.controller");
const panel = require("../controller/admin_panel.controller");
const market = require("../controller/admin_market.controller");

const router = express.Router();
router.use(panel.audit);

router.get("/me", panel.me);
router.get("/dashboard", panel.dashboard);

// Dukaanein
router.get("/shops", panel.listShops);
router.get("/shops/:id", panel.getShop);
router.patch("/shops/:id", panel.updateShop); // block / verify / note / naam-pata
router.post("/shops/:shopId/subscription/grant", adminController.grantSubscription); // plan dena (cash / free)
router.post("/shops/:id/subscription/extend", panel.extendSubscription);
router.post("/shops/:id/subscription/cancel", panel.cancelSubscription); // turant Free
router.post("/shops/:id/delete", panel.deleteShop);
router.post("/shops/:id/restore", panel.restoreShop);

// Users
router.get("/users", panel.listUsers);
router.get("/users/:id", panel.getUser);
router.patch("/users/:id", panel.updateUser); // block / unblock
router.post("/users/:id/logout-all", panel.logoutUser);

// Plans
router.get("/plans", adminController.getAllPlans);
router.post("/plans", adminController.createPlan);
router.patch("/plans/:id", adminController.updatePlan);

// Payments (plan ki kharid)
router.get("/subscription-payments", panel.listPayments);
router.get("/subscription-payments.csv", panel.paymentsCsv);
router.post("/subscription-payments/:id/mark-refunded", panel.markRefunded);

// Marketplace: commission + growth features + booking ke niyam
router.get("/marketplace-settings", panel.getMarketplace);
router.put("/marketplace-settings", panel.putMarketplace);

// Customer app: bookings + reviews (chhupana)
router.get("/bookings", market.listBookings);
router.get("/reviews", market.listReviews);
router.patch("/reviews/:id", market.updateReview);

// Notifications sab dukaanon ko
router.get("/broadcasts", panel.listBroadcasts);
router.post("/broadcast", panel.broadcast);

// App settings
router.get("/app-config", adminController.getAppConfigAdmin);
router.put("/app-config", adminController.updateAppConfig); // naya version / force update
router.get("/festivals", panel.listFestivals);
router.post("/festivals", adminController.createSystemFestival);
router.delete("/festivals/:id", panel.deleteFestival);

// Admins + audit log
router.get("/admins", panel.listAdmins);
router.post("/admins", panel.addAdmin);
router.patch("/admins/:id", panel.updateAdmin);
router.delete("/admins/:id", panel.removeAdmin);
router.get("/audit-log", panel.auditLog);

module.exports = router;
