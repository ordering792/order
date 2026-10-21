const { z } = require("zod");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const OrderPlan = require("../models/OrderPlan");
const asyncHandler = require("../utils/asyncHandler");

const listUsersSchema = z.object({
  search: z.string().max(100).optional(),
  role: z.enum(["user", "owner", "admin"]).optional(),
  status: z.enum(["online", "offline", "burned"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const updateUserSchema = z
  .object({
    role: z.enum(["user", "owner", "admin"]).optional(),
    status: z.enum(["online", "offline", "burned"]).optional(),
    cryptoAddress: z.string().max(200).nullish(),
    cryptoQrUrl: z.string().max(2000).nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No updates provided",
  });

// Owner က ကိုယ့် downline user တွေကိုသာ မြင်ရမယ်။
async function ownerUserIds(ownerId) {
  return User.find({ ownerId }).distinct("_id");
}

exports.listUsers = asyncHandler(async (req, res) => {
  const parsed = listUsersSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { search, role, status, page, limit } = parsed.data;
  const filter = {};

  if (role) filter.role = role;
  if (status) filter.status = status;

  // Owner က ကိုယ့် downline တွေကိုသာ မြင်ရမယ် (ကိုယ်တိုင်လည်း ပါဝင်မယ်)။
  if (req.user.role === "owner") {
    filter.$or = [{ ownerId: req.user._id }, { _id: req.user._id }];
  }

  if (search) {
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [{ name: rx }, { phone: rx }, { invitationCode: rx }] },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(
        "name phone invitationCode role status balance walletAddress ownerId language cryptoAddress cryptoQrUrl createdAt",
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({
    users,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const parsed = updateUserSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (
    id === req.user._id.toString() &&
    parsed.data.role &&
    parsed.data.role !== "admin"
  ) {
    return res.status(400).json({
      message: "You cannot change your own admin role",
    });
  }

  // နောက်ဆုံး admin ကို ဖယ်ပစ်/role လျှော့ခြင်း မပြုလုပ်ခွင့် —
  // ဒါဆိုရင် admin panel ကို ဝင်လို့မရတော့ဘူး။
  const losesAdmin =
    (parsed.data.role && parsed.data.role !== "admin") ||
    parsed.data.status === "burned";

  if (losesAdmin && user.role === "admin") {
    const otherAdmins = await User.countDocuments({
      role: "admin",
      status: { $ne: "burned" },
      _id: { $ne: user._id },
    });

    if (otherAdmins === 0) {
      return res.status(400).json({
        message: "The last active admin cannot be removed or demoted",
      });
    }
  }

  if (parsed.data.role !== undefined) user.role = parsed.data.role;
  if (parsed.data.status !== undefined) user.status = parsed.data.status;
  if (parsed.data.cryptoAddress !== undefined) {
    user.cryptoAddress = parsed.data.cryptoAddress;
  }
  if (parsed.data.cryptoQrUrl !== undefined) {
    user.cryptoQrUrl = parsed.data.cryptoQrUrl;
  }

  await user.save();

  res.json({
    user: {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      invitationCode: user.invitationCode,
      role: user.role,
      status: user.status,
      balance: user.balance,
      walletAddress: user.walletAddress,
      ownerId: user.ownerId,
      language: user.language,
      createdAt: user.createdAt,
    },
  });
});

exports.stats = asyncHandler(async (req, res) => {
  const isOwner = req.user.role === "owner";
  const userIds = isOwner ? await ownerUserIds(req.user._id) : null;

  const scopeUsers = (extra = {}) => {
    if (!isOwner) return extra;
    return { ...extra, userId: { $in: userIds } };
  };

  const scopeTx = (extra = {}) => {
    if (!isOwner) return extra;
    return { ...extra, userId: { $in: userIds } };
  };

  const [
    totalUsers,
    totalOwners,
    totalProducts,
    pendingDeposits,
    pendingWithdraws,
    acceptedVolume,
    totalPlans,
    generatedPlans,
    completedPlans,
  ] = await Promise.all([
    isOwner
      ? User.countDocuments({ ownerId: req.user._id })
      : User.countDocuments({}),
    isOwner ? User.countDocuments({}) : User.countDocuments({ role: "owner" }),
    Product.countDocuments({}),
    Transaction.countDocuments(scopeTx({ type: "deposit", status: "pending" })),
    Transaction.countDocuments(scopeTx({ type: "withdraw", status: "pending" })),
    Transaction.aggregate([
      {
        $match: scopeTx({ type: "deposit", status: "accepted" }),
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]),
    isOwner
      ? OrderPlan.countDocuments({ userId: { $in: userIds } })
      : OrderPlan.countDocuments({}),
    isOwner
      ? OrderPlan.countDocuments({ userId: { $in: userIds }, status: "generated" })
      : OrderPlan.countDocuments({ status: "generated" }),
    isOwner
      ? OrderPlan.countDocuments({ userId: { $in: userIds }, status: "completed" })
      : OrderPlan.countDocuments({ status: "completed" }),
  ]);

  res.json({
    stats: {
      totalUsers,
      totalOwners,
      totalProducts,
      pendingDeposits,
      pendingWithdraws,
      acceptedVolume: acceptedVolume[0]?.total ?? 0,
      totalPlans,
      generatedPlans,
      completedPlans,
    },
  });
});

exports.ownerUserIds = ownerUserIds;
