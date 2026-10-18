// Orders: banana, list, detail, status, QR scan, WhatsApp, UPI link, karigar ko kaam
// Mount: /api/orders  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const ordersController = require("../controller/orders.controller");
const workersController = require("../controller/workers.controller");

const router = express.Router();

router.post("/", ordersController.createOrder);
router.get("/", ordersController.getOrders);
router.post("/scan/:qr", ordersController.scanQr);
router.patch("/items/:itemId", ordersController.updateOrderItem);
router.post("/items/:itemId/assign", workersController.assignWork);
router.get("/:id", ordersController.getOrderById);
router.patch("/:id", ordersController.updateOrder);
router.post("/:id/status", ordersController.updateOrderStatus);
router.post("/:id/notify", ordersController.notifyCustomer);
router.post("/:id/payment-link", ordersController.createPaymentLink);

module.exports = router;
