const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/uploadController");
const { auth } = require("../middleware/authMiddleware");

const uploadAuthLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many upload authorization requests" },
});

router.get("/auth", auth, uploadAuthLimit, controller.authorize);

module.exports = router;
