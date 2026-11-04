const router = require("express").Router();
const controller = require("../controllers/notificationController");
const { auth } = require("../middleware/authMiddleware");

router.get("/unread", auth, controller.unreadCount);
router.post("/seen", auth, controller.markSeen);

module.exports = router;
