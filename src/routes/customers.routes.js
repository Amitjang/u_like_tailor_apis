// Customers + parivar (members) + naap (measurements)
// Mount: /api/customers  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const customerController = require("../controller/customer.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", customerController.getCustomers);
router.post("/", customerController.createCustomer);
router.get("/lookup", customerController.lookupCustomer);
router.patch("/members/:memberId", customerController.updateMember);
router.delete("/members/:memberId", customerController.deleteMember);
router.get("/members/:memberId/measurements", customerController.getMeasurements);
router.post("/members/:memberId/measurements", customerController.saveMeasurement);
router.get("/:id", customerController.getCustomerById);
router.patch("/:id", customerController.updateCustomer);
router.delete("/:id", admin, customerController.deleteCustomer);
router.post("/:id/members", customerController.addMember);

module.exports = router;
