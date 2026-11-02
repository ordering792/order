const router = require("express").Router();
const controller = require("../controllers/taskController");
const grabController = require("../controllers/grabController");
const { auth, requireLicense, adminOrOwner } = require("../middleware/authMiddleware");

router.get("/my-tasks", auth, controller.myTasks);
router.get("/user/:userId", auth, adminOrOwner, controller.userTasks);
router.post("/complete/:id", auth, requireLicense, controller.complete);

// Grab / matching flow
router.get("/summary", auth, grabController.grabSummary);
router.get("/orders", auth, grabController.myOrders);
// ငွေရှာတဲ့ လမ်းကြောင်းတွေကိုပဲ license gate ခံတယ် — deposit/withdraw ကို ပိတ်လိုက်ရင်
// လက်မှတ်မထိုးရသေးသူရဲ့ ငွေ သွားလာမှု ပိတ်ဆို့သွားလို့။
router.post("/match", auth, requireLicense, grabController.match);
router.post("/:id/submit", auth, requireLicense, grabController.submit);

module.exports = router;
