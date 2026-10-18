// Dukaan: banana, profile, chalu plan, team
// Mount: /api/shops  —  Login zaroori; / (list/banana) ke alawa X-Shop-Id header bhi (route par)
const express = require("express");
const { requireRole, requireAuth, requireShop } = require("../middleware");
const shopController = require("../controller/shop.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");
const owner = requireRole("owner");

router.get("/", requireAuth, shopController.getMyShops);
router.post("/", requireAuth, shopController.createShop);
router.get("/current", requireAuth, requireShop, shopController.getShop);
router.patch("/current", requireAuth, requireShop, admin, shopController.updateShop);
router.get("/subscription", requireAuth, requireShop, shopController.getSubscription);
router.get("/team", requireAuth, requireShop, admin, shopController.getTeam);
router.post("/team", requireAuth, requireShop, owner, shopController.addTeamMember);
router.delete("/team/:memberId", requireAuth, requireShop, owner, shopController.removeTeamMember);

module.exports = router;
