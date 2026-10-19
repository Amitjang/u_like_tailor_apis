// Karigar (workers): list, kaam, advance, hisaab, piece rate, haaziri, capacity
// Mount: /api/workers  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole, requirePerm } = require("../middleware");
const workersController = require("../controller/workers.controller");
const staffAccess = require("../controller/staff_access.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");
const owner = requireRole("owner");

router.get("/", workersController.getWorkers); // staff (bina "workers" permission): sirf apna record
router.post("/", requirePerm("workers"), workersController.createWorker);
router.get("/earnings", requirePerm("workers"), workersController.getEarnings);
router.patch("/assignments/:id", workersController.updateAssignment);
router.get("/piece-rates", requirePerm("workers"), workersController.getPieceRates);
router.put("/piece-rates", requirePerm("workers"), workersController.setPieceRate);
router.get("/attendance", requirePerm("workers"), workersController.getAttendance);
router.put("/attendance", requirePerm("workers"), workersController.saveAttendance);
// Staff login (mobile + password) — sirf maalik
router.get("/:id/access", owner, staffAccess.getAccess);
router.put("/:id/access", owner, staffAccess.saveAccess);
router.patch("/:id/access", owner, staffAccess.setAccessStatus);
router.delete("/:id/access", owner, staffAccess.deleteAccess);
router.patch("/:id", requirePerm("workers"), workersController.updateWorker);
router.delete("/:id", admin, workersController.deleteWorker);
router.put("/:id/capacity", requirePerm("workers"), workersController.setCapacity);
router.get("/:id/work", workersController.getWork);
router.post("/:id/advances", requirePerm("workers"), workersController.giveAdvance);
router.get("/:id/payouts", requirePerm("workers"), workersController.getPayouts);
router.post("/:id/payouts", requirePerm("workers"), workersController.createPayout);

module.exports = router;
