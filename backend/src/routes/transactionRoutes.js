const router = require("express").Router();
const controller = require("../controllers/transactionController");
const {
  auth,
  adminOnly,
  adminOrOwner,
} = require("../middleware/authMiddleware");

router.post("/", auth, controller.create);
router.get("/", auth, controller.myTransactions);
router.get("/admin", auth, adminOrOwner, controller.adminList);
router.post("/admin/:id/accept", auth, adminOrOwner, controller.adminAccept);
router.post("/admin/:id/reject", auth, adminOrOwner, controller.adminReject);

module.exports = router;
