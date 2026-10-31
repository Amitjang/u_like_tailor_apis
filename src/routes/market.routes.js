// Customer app (U Like Tailor): paas ki dukaanein, booking, waitlist, review
// Mount: /api/market  —  /shops* bina login (login ho to bhi chalega); baaki login zaroori
const express = require("express");
const { requireAuth } = require("../middleware");
const c = require("../controller/market.controller");

const router = express.Router();

router.get("/shops", c.searchShops);
router.get("/shops/:id", c.shopPage);
router.get("/shops/:id/slots", c.optionalAuth, c.shopSlots);
router.get("/shops/:id/reviews", c.shopReviews);

router.use(requireAuth);
router.get("/me", c.getMe);
router.patch("/me", c.patchMe);
router.post("/bookings", c.createBooking);
router.get("/bookings", c.myBookings);
router.get("/bookings/:id", c.myBooking);
router.post("/bookings/:id/cancel", c.cancelMine);
router.post("/bookings/:id/reschedule", c.rescheduleMine);
router.post("/bookings/:id/advance-paid", c.advancePaid);
router.post("/bookings/:id/review", c.reviewMine);
router.post("/waitlist", c.joinWaitlist);
router.get("/waitlist", c.myWaitlist);
router.delete("/waitlist/:id", c.leaveWaitlist);
router.get("/notifications", c.myNotifications);
router.post("/notifications/read-all", c.readAll);

module.exports = router;
