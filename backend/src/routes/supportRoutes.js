const router = require("express").Router();
const controller = require("../controllers/supportController");
const {
  auth,
  adminOnly,
  adminOrOwner,
} = require("../middleware/authMiddleware");
const { guestOrAuth } = require("../middleware/guestOrAuth");

router.post("/conversations", guestOrAuth, controller.startConversation);
router.get("/conversations", guestOrAuth, controller.listMyConversations);
router.get("/conversations/:id", guestOrAuth, controller.getConversation);
router.post("/conversations/:id/messages", guestOrAuth, controller.sendMessage);
router.post(
  "/conversations/:id/close",
  guestOrAuth,
  controller.closeConversation,
);

// Admin & Owner can manage conversations
// Owner sees only their users' conversations (filtered in controller)
router.get(
  "/admin/conversations",
  auth,
  adminOrOwner,
  controller.adminListConversations,
);
router.get(
  "/admin/conversations/:id",
  auth,
  adminOrOwner,
  controller.adminGetConversation,
);
router.post(
  "/admin/conversations/:id/messages",
  auth,
  adminOrOwner,
  controller.adminSendMessage,
);
router.post(
  "/admin/conversations/:id/close",
  auth,
  adminOrOwner,
  controller.adminCloseConversation,
);
router.post(
  "/admin/conversations/:id/reopen",
  auth,
  adminOrOwner,
  controller.adminReopenConversation,
);
router.post(
  "/admin/conversations/:id/read",
  auth,
  adminOrOwner,
  controller.adminMarkRead,
);

// Admin only
router.get("/admin/online", auth, adminOnly, controller.getOnlineStatus);

module.exports = router;
