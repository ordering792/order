const router = require("express").Router();
const controller = require("../controllers/adminController");
const { auth, adminOnly, adminOrOwner } = require("../middleware/authMiddleware");

router.get("/stats", auth, adminOrOwner, controller.stats);

// Owner က ကိုယ့် downline တွေကိုသာ မြင်ရမယ် (controller မှာ scope လုပ်ထား)။
router.get("/users", auth, adminOrOwner, controller.listUsers);

// Order plan card board — user အားလုံး (role=user) + active plan။
router.get("/order-board", auth, adminOrOwner, controller.orderBoard);

// Role / status ပြောင်းခြင်းကို admin သာ လုပ်ခွင့်ရှိတယ်။
router.patch("/users/:id", auth, adminOnly, controller.updateUser);

// Password reset ကို admin နဲ့ owner နှစ်ယောက်လုံး လုပ်လို့ရတယ် — owner က သူ့
// downline user (role=user) တွေကိုပဲ (controller မှာ စစ်)။ Balance ညှိတာ admin သာ။
// Target က admin ဆို controller မှာ 403။
router.put("/users/:id/password", auth, adminOrOwner, controller.resetUserPassword);
router.post("/users/:id/balance", auth, adminOnly, controller.adjustUserBalance);

// Withdraw ပို့ address — admin က user/owner နှစ်ခုလုံး ပြောင်းလို့ရတယ်။
// Target က admin ဆို 403, pending withdrawal ရှိရင် 409 (controller မှာ)။
router.put(
  "/users/:id/wallet-address",
  auth,
  adminOnly,
  controller.updateUserWalletAddress,
);

module.exports = router;
