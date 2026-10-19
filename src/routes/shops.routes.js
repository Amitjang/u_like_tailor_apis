// Dukaan: banana, profile, chalu plan, team
// Mount: /api/shops  —  Login zaroori; / (list/banana) ke alawa X-Shop-Id header bhi (route par)
const express = require("express");
const { requireRole, requirePerm, requireAuth, requireShop } = require("../middleware");
const shopController = require("../controller/shop.controller");
const staffAccess = require("../controller/staff_access.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");
const owner = requireRole("owner");

router.get("/", requireAuth, shopController.getMyShops);
router.post("/", requireAuth, shopController.createShop);
router.get("/current", requireAuth, requireShop, shopController.getShop);
router.patch("/current", requireAuth, requireShop, requirePerm("settings"), shopController.updateShop);
router.get("/subscription", requireAuth, requireShop, shopController.getSubscription);
router.get("/team", requireAuth, requireShop, admin, shopController.getTeam);
router.post("/team", requireAuth, requireShop, owner, shopController.addTeamMember);
router.delete("/team/:memberId", requireAuth, requireShop, owner, shopController.removeTeamMember);
// Staff ki permissions (app mein kya dikhe / kya kar sake) — sirf maalik
router.get("/permissions", requireAuth, requireShop, owner, staffAccess.getPermissionCatalog);
router.put("/team/:memberId/permissions", requireAuth, requireShop, owner, staffAccess.setMemberPermissions);

module.exports = router;
