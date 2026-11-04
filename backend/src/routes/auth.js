const router = require("express").Router();
const authController = require("../controllers/authController");
const ownerController = require("../controllers/ownerController");
const walletController = require("../controllers/walletController");
const { auth, adminOnly } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many login attempts" },
});

router.post("/register", authController.register);
router.post("/login", loginLimit, authController.login);
router.get("/me", auth, authController.me);
router.post("/license-accept", auth, authController.acceptLicense);
router.put("/language", auth, authController.updateLanguage);
router.get("/languages", authController.getLanguages);
router.put("/password", auth, authController.changePassword);

// Payout wallet ဆီ ငွေပို့လိပ်စာကို admin သားပဲ ရေးတယ် (owner က ဖတ်ရုံ)။
// User ရဲ့ deposit/withdraw လမ်းကြောင်းက ဒီအောက်မှာ ဆက်ရှိတယ်။
router.put(
  "/owner/crypto-address",
  auth,
  adminOnly,
  walletController.updateOwnerCryptoAddress,
);
router.get("/deposit-info", auth, walletController.depositInfo);
router.get("/profits", auth, walletController.profits);
router.put("/wallet-address", auth, walletController.updateWalletAddress);

// Owner management (admin only)
router.post("/owners", auth, adminOnly, ownerController.createOwner);
router.get("/owners", auth, adminOnly, ownerController.listOwners);

module.exports = router;
