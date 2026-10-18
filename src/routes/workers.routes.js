// Karigar (workers): list, kaam, advance, hisaab, piece rate, haaziri, capacity
// Mount: /api/workers  —  Login (Authorization: Bearer) + X-Shop-Id header zaroori (app.js mein)
const express = require("express");
const { requireRole } = require("../middleware");
const workersController = require("../controller/workers.controller");

const router = express.Router();
const admin = requireRole("owner", "manager");

router.get("/", workersController.getWorkers);
router.post("/", admin, workersController.createWorker);
router.get("/earnings", admin, workersController.getEarnings);
router.patch("/assignments/:id", workersController.updateAssignment);
router.get("/piece-rates", admin, workersController.getPieceRates);
router.put("/piece-rates", admin, workersController.setPieceRate);
router.get("/attendance", workersController.getAttendance);
router.put("/attendance", admin, workersController.saveAttendance);
router.patch("/:id", admin, workersController.updateWorker);
router.delete("/:id", admin, workersController.deleteWorker);
router.put("/:id/capacity", admin, workersController.setCapacity);
router.get("/:id/work", workersController.getWork);
router.post("/:id/advances", admin, workersController.giveAdvance);
router.get("/:id/payouts", admin, workersController.getPayouts);
router.post("/:id/payouts", admin, workersController.createPayout);

module.exports = router;
