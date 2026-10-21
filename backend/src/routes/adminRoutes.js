const router = require("express").Router();
const controller = require("../controllers/adminController");
const { auth, adminOnly, adminOrOwner } = require("../middleware/authMiddleware");

router.get("/stats", auth, adminOrOwner, controller.stats);

// Owner က ကိုယ့် downline တွေကိုသာ မြင်ရမယ် (controller မှာ scope လုပ်ထား)။
router.get("/users", auth, adminOrOwner, controller.listUsers);

// Role / status ပြောင်းခြင်းကို admin သာ လုပ်ခွင့်ရှိတယ်။
router.patch("/users/:id", auth, adminOnly, controller.updateUser);

module.exports = router;
