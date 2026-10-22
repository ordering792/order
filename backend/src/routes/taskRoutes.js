const router = require("express").Router();
const controller = require("../controllers/taskController");
const grabController = require("../controllers/grabController");
const { auth, adminOnly, adminOrOwner } = require("../middleware/authMiddleware");

router.get("/my-tasks", auth, controller.myTasks);
router.get("/user/:userId", auth, adminOrOwner, controller.userTasks);
router.post("/generate", auth, adminOnly, controller.generate);
router.post("/complete/:id", auth, controller.complete);

// Grab / matching flow
router.get("/summary", auth, grabController.grabSummary);
router.get("/orders", auth, grabController.myOrders);
router.post("/match", auth, grabController.match);
router.post("/:id/submit", auth, grabController.submit);

module.exports = router;
