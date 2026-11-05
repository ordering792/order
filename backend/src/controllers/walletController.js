const { z } = require("zod");
const User = require("../models/User");
const WalletLedger = require("../models/WalletLedger");
const asyncHandler = require("../utils/asyncHandler");
const { WALLET_NOTES } = require("../constants/walletNotes");
const {
  INVALID_WALLET_ADDRESS_MESSAGE,
  normalizeWalletAddress,
  isTronAddress,
} = require("../utils/walletAddress");
const {
  isPayoutAccount,
  confirmLoginPassword,
  PAYOUT_ACCOUNT_MESSAGE,
} = require("../services/walletGuard");

const cryptoAddressSchema = z.object({
  cryptoAddress: z.string().min(10).max(100),
  qrUrl: z.string().max(2000).nullish(),
  // Payout address ပြောင်းတဲ့သူ ကိုယ်တိုင်ဆိုတာ အတည်ပြ — login password။
  password: z.string().max(100).optional(),
});

const walletAddressSchema = z.object({
  walletAddress: z.string().min(10).max(100),
  // User က ကိုယ့် withdraw လိပ်စာ ချိတ်တဲ့အခါ login password ထပ်စစ်တယ် —
  // ဖုန်း လက်ဝယ်ရှိသူက JWT ထဲ ဝင်ရုံနဲ့ ပိုက်ဆံသွားနေကျ လိပ်စာကို လှည့်လို့
  // မရအောင် (withdraw လမ်းနဲ့ တစ်စည်းတစ်လက်)။
  password: z.string().max(100).optional(),
});

// "တစ်ကြိမ်တည်း သိမ်းလို့ရ" ဆိုတာ ဒီ endpoint မှာ စာသားပဲ ဖြစ်နေခဲ့တယ် —
// အကြိမ်ကြိမ် ခွင့်ပြုခဲ့တယ်။ အခု တကယ်ပိတ်တယ်။ ပြောင်းချင်ရင် admin panel
// (admin/owner က user row ရဲ့ လိပ်စာ ပြောင်းလို့ရနေဆဲ)။
const ALREADY_BOUND_MESSAGE =
  "Your wallet address is already saved and cannot be changed from here";

// Admin / Owner ကိုယ် payout address + QR သတ်မှတ်ခြင်း
exports.updateOwnerCryptoAddress = asyncHandler(async (req, res) => {
  const parsed = cryptoAddressSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  // ဒီ endpoint က payout account ရဲ့ လိပ်စာကို ပြောင်းတာ (admin သား) —
  // token ခိုးထားတဲ့သူ address လှည့်လိုက်ရင် ပိုက်ဆံ ဆုံးရှုံးနိုင်လို့ password စစ်တယ်။
  const confirmed = await confirmLoginPassword(
    req.user._id,
    parsed.data.password,
  );

  if (!confirmed.ok) {
    console.log(
      `[audit] payout address change rejected account=${req.user._id} reason=${confirmed.message}`,
    );

    return res.status(confirmed.status).json({ message: confirmed.message });
  }

  await User.findByIdAndUpdate(req.user._id, {
    cryptoAddress: parsed.data.cryptoAddress,
    cryptoQrUrl: parsed.data.qrUrl || null,
  });

  res.json({ message: "Crypto address updated" });
});

// User က deposit လုပ်ရား ပေးရမယ့် address:
//   သူ့ owner က သတ်မှတ်ထားရင် owner ရဲ့ address၊ မထည့်ထားရင် (ဒါမှမဟုတ် owner
//   burn ဖြစ်နေရင်) admin ရဲ့ address။
exports.depositInfo = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate(
    "ownerId",
    "name cryptoAddress cryptoQrUrl status",
  );

  const owner = user.ownerId;

  // Burn လုပ်တဲ့ ဆိုလိုရင်းက ဒီ account ဆီ ငွေ မပို့ရဘူး — ဒါကြောင့် owner burn
  // ဖြစ်နေရင် သူ့ downline user တွေ admin wallet ကို ပြန်ကျတယ်။
  if (owner?.cryptoAddress && owner.status !== "burned") {
    return res.json({
      cryptoAddress: owner.cryptoAddress,
      qrUrl: owner.cryptoQrUrl ?? null,
      payTo: owner.name,
      source: "owner",
    });
  }

  const admin = await User.findOne({
    role: "admin",
    status: { $ne: "burned" },
    cryptoAddress: { $nin: [null, ""] },
  }).sort({ createdAt: 1 });

  if (admin) {
    return res.json({
      cryptoAddress: admin.cryptoAddress,
      qrUrl: admin.cryptoQrUrl ?? null,
      payTo: admin.name,
      source: "admin",
    });
  }

  res.json({
    cryptoAddress: null,
    qrUrl: null,
    payTo: null,
    source: null,
  });
});

// Home page အတွက် အမြင်နိုင်ငွာ: စုစုပေါင်း profit / ဒီနေ့ / မနက်ဖြန် / referral bonus
exports.profits = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const commissionMatch = {
    userId: req.user._id,
    type: "credit",
    note: WALLET_NOTES.TASK_COMMISSION,
  };

  const [total, today, yesterday, team] = await Promise.all([
    WalletLedger.aggregate([
      { $match: commissionMatch },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    WalletLedger.aggregate([
      { $match: { ...commissionMatch, createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    WalletLedger.aggregate([
      {
        $match: {
          ...commissionMatch,
          createdAt: { $gte: startOfYesterday, $lt: startOfToday },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    WalletLedger.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: "credit",
          note: WALLET_NOTES.REFERRAL_BONUS,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  res.json({
    profits: {
      total: total[0] ? String(total[0].total) : "0.00",
      today: today[0] ? String(today[0].total) : "0.00",
      yesterday: yesterday[0] ? String(yesterday[0].total) : "0.00",
      team: team[0] ? String(team[0].total) : "0.00",
    },
  });
});

// User ကိုယ်ကိုယ် ငွေလွှဲမယ့် wallet address
exports.updateWalletAddress = asyncHandler(async (req, res) => {
  const parsed = walletAddressSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  // ဒီ endpoint မှာ password field မပါလို့ admin/owner account တွေကို
  // ချွန်ပေးတယ် — မဟုတ်ရင် admin panel ရဲ့ gate ကို ဒီလမ်းနဲ့ လှော်ခတ်လို့ရမယ်။
  if (isPayoutAccount(req.user)) {
    return res.status(403).json({ message: PAYOUT_ACCOUNT_MESSAGE });
  }

  const walletAddress = normalizeWalletAddress(parsed.data.walletAddress);

  if (!isTronAddress(walletAddress)) {
    return res.status(400).json({ message: INVALID_WALLET_ADDRESS_MESSAGE });
  }

  // auth middleware ရဲ့ select whitelist မှာ walletAddress မပါလို့ ဒီမှာ ဖတ်တယ်။
  const alreadyBound = await User.exists({
    _id: req.user._id,
    walletAddress: { $nin: [null, ""] },
  });

  if (alreadyBound) {
    return res.status(409).json({ message: ALREADY_BOUND_MESSAGE });
  }

  const confirmed = await confirmLoginPassword(
    req.user._id,
    parsed.data.password,
  );

  if (!confirmed.ok) {
    // 422 — လိပ်စာမှားတာ (400) နဲ့ password မှားတာကို frontend ခွဲပြနိုင်အောင်။
    // 401 ကတော့ ဘယ်တော့မှ မသုံးဘူး: client.ts က session ကို ရှင်းပြီး
    // user ကို ထုတ်ချလိုက်မယ်။
    return res.status(422).json({ message: confirmed.message });
  }

  await User.findByIdAndUpdate(req.user._id, { walletAddress });

  res.json({ message: "Wallet address updated", walletAddress });
});
