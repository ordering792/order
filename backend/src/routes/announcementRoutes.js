const router = require("express").Router();
const controller = require("../controllers/announcementController");
const { auth, adminOnly } = require("../middleware/authMiddleware");

router.post("/", auth, adminOnly, controller.create);
router.get("/", auth, controller.list);
router.get("/:id", auth, controller.getById);

module.exports = router;
