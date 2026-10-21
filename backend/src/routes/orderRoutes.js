const router = require("express").Router();
const controller = require("../controllers/orderPlanController");
const {
  auth,
  adminOnly,
  adminOrOwner,
} = require("../middleware/authMiddleware");

router.post("/plans", auth, adminOrOwner, controller.createPlan);
router.get("/plans", auth, adminOrOwner, controller.adminList);
router.get("/plans/my", auth, controller.myPlan);
router.get("/plans/:id", auth, adminOrOwner, controller.getPlan);
router.post("/plans/:id/generate", auth, adminOrOwner, controller.generate);
router.delete("/plans/:id", auth, adminOrOwner, controller.deletePlan);

module.exports = router;
