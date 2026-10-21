const router = require("express").Router();
const controller = require("../controllers/taskController");
const { auth, adminOnly, adminOrOwner } = require("../middleware/authMiddleware");

router.get("/my-tasks", auth, controller.myTasks);
router.get("/user/:userId", auth, adminOrOwner, controller.userTasks);
router.post("/generate", auth, adminOnly, controller.generate);
router.post("/complete/:id", auth, controller.complete);

module.exports = router;
