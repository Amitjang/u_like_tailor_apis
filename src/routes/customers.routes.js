// Customers + parivar (members) + naap (measurements)
// Mount: /api/customers  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const customerController = require("../controller/customer.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", requirePerm("customers_view", "orders_create"), customerController.getCustomers);
router.post("/", requirePerm("customers_edit"), customerController.createCustomer);
router.get("/lookup", requirePerm("customers_view", "orders_create"), customerController.lookupCustomer);
router.patch("/members/:memberId", requirePerm("customers_edit"), customerController.updateMember);
router.delete("/members/:memberId", requirePerm("customers_edit"), customerController.deleteMember);
router.get("/members/:memberId/measurements", requirePerm("measurements"), customerController.getMeasurements);
router.post("/members/:memberId/measurements", requirePerm("measurements"), customerController.saveMeasurement);
router.get("/:id", requirePerm("customers_view", "orders_create"), customerController.getCustomerById);
router.patch("/:id", requirePerm("customers_edit"), customerController.updateCustomer);
router.delete("/:id", admin, customerController.deleteCustomer);
router.post("/:id/members", requirePerm("customers_edit"), customerController.addMember);

module.exports = router;
