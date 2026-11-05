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
// downline user (role=user) တွေကိုပဲ (controller မှာ စစ်)။ Target က admin ဆို 403။
router.put("/users/:id/password", auth, adminOrOwner, controller.resetUserPassword);

// Balance ညှိတာနဲ့ withdraw လိပ်စာ ပြောင်းတာကလည်း owner ကိုယ့် downline user
// (role=user) တွေအပေါ်မှာပဲ — scope check တွေက controller ထဲ၊ UI ခလုတ်ပိတ်တာက
// အစစ်မဟုတ်။ Owner က credit/debit နှစ်ခုလုံး ကုန်တာလုပ်ခွင့်ရှိတယ် (ကြမ်းခင်းမထား)၊
// ဒါပေမယ့် owner/admin row ဒါမှမဟုတ် သူ့ ownerId မဟုတ်တဲ့ user ဆို 403။
router.post("/users/:id/balance", auth, adminOrOwner, controller.adjustUserBalance);

// Target က admin ဆို 403, pending withdrawal ရှိရင် 409 (controller မှာ)။
router.put(
  "/users/:id/wallet-address",
  auth,
  adminOrOwner,
  controller.updateUserWalletAddress,
);

module.exports = router;
