const router = require("express").Router();
const controller = require("../controllers/orderPlanController");
const {
  auth,
  adminOrOwner,
} = require("../middleware/authMiddleware");

router.post("/plans", auth, adminOrOwner, controller.createPlan);
router.get("/plans", auth, adminOrOwner, controller.adminList);
router.get("/plans/my", auth, controller.myPlan);
router.get("/plans/:id", auth, adminOrOwner, controller.getPlan);
router.patch("/plans/:id", auth, adminOrOwner, controller.updatePlan);
router.post("/plans/:id/generate", auth, adminOrOwner, controller.generate);
// Round အတွင်း lucky tag ထပ်ထည့်တာ — မစမ်းသေးတဲ့ order ကိုပဲ backend က တားတယ်။
router.post(
  "/plans/:id/lucky-positions",
  auth,
  adminOrOwner,
  controller.addLuckyPosition,
);
// ထည့်ထားတဲ့ tag ကို ပြန်ဖျက်တာ — အခုလဲ မစမ်းသေးတဲ့ order ကိုပဲ ခွင့်တယ်။
router.delete(
  "/plans/:id/lucky-positions/:orderNumber",
  auth,
  adminOrOwner,
  controller.removeLuckyPosition,
);
router.delete("/plans/:id", auth, adminOrOwner, controller.deletePlan);

module.exports = router;
