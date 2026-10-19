// Orders: banana, list, detail, status, QR scan, WhatsApp, UPI link, karigar ko kaam
// Mount: /api/orders  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requirePerm } = require("../middleware");
const ordersController = require("../controller/orders.controller");
const workersController = require("../controller/workers.controller");

const router = express.Router();

router.post("/", requirePerm("orders_create"), ordersController.createOrder);
router.get("/", requirePerm("orders_view"), ordersController.getOrders);
router.post("/scan/:qr", requirePerm("orders_view"), ordersController.scanQr);
router.patch("/items/:itemId", requirePerm("orders_edit"), ordersController.updateOrderItem);
router.post("/items/:itemId/assign", requirePerm("orders_edit"), workersController.assignWork);
router.get("/:id", requirePerm("orders_view"), ordersController.getOrderById);
router.patch("/:id", requirePerm("orders_edit"), ordersController.updateOrder);
router.post("/:id/status", requirePerm("orders_edit"), ordersController.updateOrderStatus);
router.post("/:id/notify", requirePerm("orders_edit"), ordersController.notifyCustomer);
router.post("/:id/payment-link", requirePerm("payments"), ordersController.createPaymentLink);

module.exports = router;
