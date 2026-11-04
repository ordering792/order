const router = require("express").Router();
const controller = require("../controllers/announcementController");
const { auth, adminOrOwner } = require("../middleware/authMiddleware");

// Owner လည်း ပို့လို့ရတယ် — ဒါပေမဲ့ သူ့ downline ကိုပဲ (controller မှာ စစ်)။
router.post("/", auth, adminOrOwner, controller.create);
router.get("/", auth, controller.list);
router.get("/:id", auth, controller.getById);

module.exports = router;
