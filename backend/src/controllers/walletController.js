const { z } = require("zod");
const User = require("../models/User");
const WalletLedger = require("../models/WalletLedger");
const asyncHandler = require("../utils/asyncHandler");

const cryptoAddressSchema = z.object({
  cryptoAddress: z.string().min(10).max(100),
  qrUrl: z.string().max(2000).nullish(),
});

const walletAddressSchema = z.object({
  walletAddress: z.string().min(10).max(100),
});

// Admin / Owner ကိုယ် payout address + QR သတ်မှတ်ခြင်း
exports.updateOwnerCryptoAddress = asyncHandler(async (req, res) => {
  const parsed = cryptoAddressSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  await User.findByIdAndUpdate(req.user._id, {
    cryptoAddress: parsed.data.cryptoAddress,
    cryptoQrUrl: parsed.data.qrUrl || null,
  });

  res.json({ message: "Crypto address updated" });
});

// User က deposit လုပ်ရား ပေးရမယ့် address:
//   သူ့ owner က သတ်မှတ်ထားရင် owner ရဲ့ address၊ မထည့်ထားရင် admin ရဲ့ address။
exports.depositInfo = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate(
    "ownerId",
    "name cryptoAddress cryptoQrUrl",
  );

  const owner = user.ownerId;

  if (owner?.cryptoAddress) {
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
    note: "Task commission",
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
          note: "Referral bonus",
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

  await User.findByIdAndUpdate(req.user._id, {
    walletAddress: parsed.data.walletAddress,
  });

  res.json({ message: "Wallet address updated" });
});
