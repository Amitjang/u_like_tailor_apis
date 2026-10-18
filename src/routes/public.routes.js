// Bina login: bhashayein, plans (pricing), customer tracking page, public catalog
// Mount: /api/public  —  Bina login
const express = require("express");
const publicController = require("../controller/public.controller");

const router = express.Router();

router.get("/languages", publicController.getLanguages);
router.get("/plans", publicController.getPlans);
router.get("/track/:token", publicController.trackOrder);
router.get("/shops/:shopId/catalog", publicController.getCatalog);

module.exports = router;
