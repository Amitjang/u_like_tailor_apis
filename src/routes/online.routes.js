// Online dukaan (shop app): profile, working hours, niyam, bookings, din ka view, waitlist, reviews
// Mount: /api/online  —  Login + X-Shop-Id + "bookings" permission (app.js mein); settings badalna = "settings" permission
const express = require("express");
const { requirePerm } = require("../middleware");
const c = require("../controller/online.controller");

const router = express.Router();
const settings = requirePerm("settings");

router.get("/settings", c.getSettings);
router.put("/profile", settings, c.putProfile);
router.put("/hours", settings, c.putHours);
router.put("/rules", settings, c.putRules);
router.post("/holidays", settings, c.addHolidays);
router.delete("/holidays/:date", settings, c.removeHoliday);

router.get("/calendar", c.calendar); // din ka view (slot + bookings)
router.get("/month", c.month);       // mahine ka rang (free / few / full / closed)
router.post("/blocks", c.addBlock);
router.delete("/blocks/:id", c.removeBlock);

router.get("/bookings", c.listBookings);
router.get("/bookings/:id", c.getBooking);
router.post("/bookings/:id/accept", c.accept);
router.post("/bookings/:id/decline", c.decline);
router.post("/bookings/:id/cancel", c.cancel);
router.post("/bookings/:id/complete", c.complete);
router.post("/bookings/:id/no-show", c.noShow);
router.post("/bookings/:id/advance-received", c.advanceReceived);
router.post("/bookings/:id/advance-refunded", c.advanceRefunded);
router.post("/bookings/:id/link-order", c.linkOrder);

router.get("/waitlist", c.listWaitlist);
router.get("/reviews", c.listReviews);
router.post("/reviews/:id/reply", c.replyReview);

module.exports = router;
