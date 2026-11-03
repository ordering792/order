const bcrypt = require("bcryptjs");
const { z } = require("zod");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const OrderPlan = require("../models/OrderPlan");
const WalletLedger = require("../models/WalletLedger");
const asyncHandler = require("../utils/asyncHandler");
const { escapeRegExp } = require("../utils/regex");
const { normalizePassword } = require("../utils/phone");
const { deviceInfo } = require("../utils/deviceInfo");
const { toCents, fromCents, decimal } = require("../utils/money");
const {
  INVALID_WALLET_ADDRESS_MESSAGE,
  normalizeWalletAddress,
  isTronAddress,
} = require("../utils/walletAddress");
const { WALLET_NOTES } = require("../constants/walletNotes");
const { emitToAdmins, emitToUser } = require("../socket");
const { ownerUserIds } = require("../services/ownershipService");
const { serializePlan } = require("../services/orderPlanService");
const {
  hasPendingWithdrawal,
  isPayoutAccount,
  confirmLoginPassword,
  PENDING_WITHDRAWAL_MESSAGE,
} = require("../services/walletGuard");

// Card grid — page တစ်ခုကို card ၂၄ ခု default (desktop 4 ပိုင်း x 6 rows)။
const orderBoardSchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
});

// Presence window — Users list မှာ Online လို့ ပြဖို့ lastSeenAt နှိုင်းယှဉ်တဲ့ အချိန်။
// auth middleware ရဲ့ ၆၀ စက္ကန့် throttle ထက် ကျယ်ရမယ် (မဟုတ်ရင် window အစောပိုင်း
// မှာပဲ offline ပြသွားမယ်)။
const ONLINE_WINDOW_MS = 5 * 60_000;

function isOnline(user) {
  if (user.status === "burned" || !user.lastSeenAt) return false;

  return Date.now() - new Date(user.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
}

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
    adminNote: z.string().trim().max(500).nullish(),
    // Payout address (cryptoAddress/cryptoQrUrl) ကို ထည့်တဲ့အခါသာ အသုံးဝင် —
    // admin/owner account ရဲ့ လိပ်စာဆို login password စစ်တယ်။
    password: z.string().max(100).optional(),
  })
  .refine((data) => Object.keys(data).some((key) => key !== "password"), {
    message: "No updates provided",
  });

const resetPasswordSchema = z.object({
  password: z.string().min(6).max(100),
});

// User တစ်ယောက်ရဲ့ payout (TRC20) address ကို admin က လက်ဖြင့် ပြောင်းတာ။
// format စစ်တာက util မှာ — user ကိုယ်တိုင်ပြောင်းတဲ့ endpoint နဲ့ တစ်ပြေးညီ။
const walletAddressSchema = z.object({
  walletAddress: z.string().min(10).max(100),
  // Target က admin/owner ဆို ဒီ password မရှိဘဲ မပြောင်းရ (controller မှာ စစ်)။
  password: z.string().max(100).optional(),
});

// toCents() က sign မပါတဲ့ number string ပဲ ယူတယ် — direction ကို type နဲ့ ခွဲထား။
const adjustBalanceSchema = z.object({
  type: z.enum(["credit", "debit"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid monetary amount").max(14),
  reason: z.string().max(200).optional(),
});

exports.listUsers = asyncHandler(async (req, res) => {
  const parsed = listUsersSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { search, role, status, page, limit } = parsed.data;
  const onlineAfter = new Date(Date.now() - ONLINE_WINDOW_MS);

  // scope = role + search + owner downline သက်သက်။ Count tile တွေက ဒီ subset
  // ပေါ်မှာ တွက်တယ်၊ status filter ကို မလိုက်နာဘူး — မဟုတ်ရင် Online ရွေးတိုင်း
  // Offline/Burned က အမြဲ သုည ဖြစ်သွားမယ်။
  const scope = {};
  const and = [];

  if (role) scope.role = role;

  // Owner က ကိုယ့် downline တွေကိုသာ မြင်ရမယ် (ကိုယ်တိုင်လည်း ပါဝင်မယ်)။
  if (req.user.role === "owner") {
    scope.$or = [{ ownerId: req.user._id }, { _id: req.user._id }];
  }

  if (search) {
    const rx = new RegExp(escapeRegExp(search), "i");
    and.push({ $or: [{ name: rx }, { phone: rx }, { invitationCode: rx }] });
  }

  if (and.length) scope.$and = and;

  // Online/Offline ကို lastSeenAt ကနေ တွက်တယ် — status field ကို admin က
  // Burn/Un-burn အလံအဖြစ်ပဲ သုံးတယ်။ Owner scoping က scope.$or ကို ကြာပြီးသား
  // ဖြစ်လို့ ဒီ condition တွေက $and ထဲပဲ ဝင်ရမယ် (မဟုတ်ရင် ဖုံးသွားမယ်)။
  // status ကို scope မှာ မတင်ဘူး — count aggregate က scope ကိုပဲ သုံးတယ်။
  const filter = { ...scope };

  if (status === "burned") {
    filter.status = "burned";
  } else if (status) {
    filter.$and = [
      ...and,
      { status: { $ne: "burned" } },
      status === "online"
        ? { lastSeenAt: { $gte: onlineAfter } }
        : {
            $or: [
              { lastSeenAt: null },
              { lastSeenAt: { $lt: onlineAfter } },
            ],
          },
    ];
  }

  // adminNote က admin ဆီပဲ သွားရမယ် — owner က ကိုယ့် downline ကို ဖတ်တဲ့အခါ
  // field ကို လုံးဝ မတောင်းဘူး (schema မှာ select: false ဖြစ်နေပြီးသား)။
  const selectedFields =
    "name phone invitationCode role status balance walletAddress ownerId language cryptoAddress cryptoQrUrl createdAt ipAddress lastLoginAt lastSeenAt lastUserAgent" +
    (req.user.role === "admin" ? " +adminNote" : "");

  const [users, total, bucketRows] = await Promise.all([
    User.find(filter)
      .select(selectedFields)
      // lastLoginAt မရှိသူ (ဘယ်တော့မှ မဝင်ခဲ့သူ) က BSON null အဖြစ် အောက်ဆုံးရောက်မယ်။
      .sort({ lastLoginAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    // Count tile တွေ — isOnline() နဲ့ အတူတူပဲ (burned အရင်၊ ပြီးတော့ ၅ မိနစ်
    // window)၊ ဒါပေမဲ့ scope သက်သက်ပေါ် တွက်တယ်။ lastSeenAt မရှိတဲ့ doc က
    // null < date ဖြစ်လို့ automatic offline ဖြစ်သွားတယ်။
    User.aggregate([
      { $match: scope },
      {
        $project: {
          bucket: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "burned"] }, then: "burned" },
                { case: { $gte: ["$lastSeenAt", onlineAfter] }, then: "online" },
              ],
              default: "offline",
            },
          },
        },
      },
      { $group: { _id: "$bucket", n: { $sum: 1 } } },
    ]),
  ]);

  const counts = { all: 0, online: 0, offline: 0, burned: 0 };

  for (const row of bucketRows) {
    counts[row._id] = row.n;
    counts.all += row.n;
  }

  res.json({
    users: users.map((user) => ({
      ...user,
      lastDevice: deviceInfo(user.lastUserAgent),
      online: isOnline(user),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts,
  });
});

// Order plan board — user တစ်ယောက်ကို card တစ်ခု။ active plan (draft/generated)
// တစ်ခုတည်း join တယ်၊ completed round တွေ card ပေါ် မပေါ်ဘူး (row မဖျက်ဘူး)။
exports.orderBoard = asyncHandler(async (req, res) => {
  const parsed = orderBoardSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { search, page, limit } = parsed.data;
  const filter = { role: "user" };

  // Owner က ကိုယ့် downline ကိုပဲ မြင်တယ် — role: "user" က အမြဲ သက်ဆိုင်တယ်။
  if (req.user.role === "owner") {
    filter.ownerId = req.user._id;
  }

  if (search) {
    const rx = new RegExp(escapeRegExp(search), "i");
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [{ name: rx }, { phone: rx }, { invitationCode: rx }] },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("name phone invitationCode balance")
      .sort({ lastLoginAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const plans =
    users.length > 0
      ? await OrderPlan.find({
          userId: { $in: users.map((user) => user._id) },
          status: { $in: ["draft", "generated"] },
        }).lean()
      : [];

  const activePlanByUser = new Map(
    plans.map((plan) => [String(plan.userId), plan]),
  );

  res.json({
    rows: users.map((user) => {
      const plan = activePlanByUser.get(String(user._id));

      return { user, plan: plan ? serializePlan(plan) : null };
    }),
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

  // Payout address ကို ဒီ PATCH ကနေ ပြောင်းတဲ့လမ်း (owners page) လည်း ရှိတယ် —
  // admin/owner account ဆို နှိပ်နေတဲ့ admin သူ့ login password နဲ့ အတည်ပြုခိုင်းတယ်။
  const touchesPayoutAddress =
    parsed.data.cryptoAddress !== undefined ||
    parsed.data.cryptoQrUrl !== undefined;

  if (touchesPayoutAddress && isPayoutAccount(user)) {
    const confirmed = await confirmLoginPassword(
      req.user._id,
      parsed.data.password,
    );

    if (!confirmed.ok) {
      console.log(
        `[audit] admin=${req.user._id} payout address change rejected for user=${user._id} reason=${confirmed.message}`,
      );

      return res.status(confirmed.status).json({ message: confirmed.message });
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
  if (parsed.data.adminNote !== undefined) {
    user.adminNote = parsed.data.adminNote;
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
      adminNote: user.adminNote,
    },
  });
});

// User/owner ရဲ့ withdraw လမ်းပို့ address ကို admin က လက်ဖြင့် ပြင်တာ
// (phone နဲ့ရိုက်ထည့်မှုမှား, address ပြောင်းခိုင်းမှု)။ Admin အချင်းချင်း
// ပြင်လို့မရ — panel account address ပျက်ရင် payout အားလုံး ရှုပ်ထွေးသွားမယ်။
exports.updateUserWalletAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const parsed = walletAddressSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const walletAddress = normalizeWalletAddress(parsed.data.walletAddress);

  if (!isTronAddress(walletAddress)) {
    return res.status(400).json({ message: INVALID_WALLET_ADDRESS_MESSAGE });
  }

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.role === "admin") {
    return res.status(403).json({
      message: "Admin wallet addresses must be changed from the admin's own account",
    });
  }

  // Owner ရဲ့ address ကို ပြောင်းတဲ့အခါ နှိပ်နေတဲ့ admin သူ့ login password ကို
  // စစ်တယ် — JWT တစ်ခုခုနဲ့ panel ထဲ ဝင်လိုက်သူက owner ဆီသွားငွေ လိပ်စာကို
  // အလွယ်တကူ လှည့်လို့မရအောင်။ role=user ဆို ဒီအခွင့် မလို (support လုပ်ငန်း)။
  if (isPayoutAccount(user)) {
    const confirmed = await confirmLoginPassword(
      req.user._id,
      parsed.data.password,
    );

    if (!confirmed.ok) {
      console.log(
        `[audit] admin=${req.user._id} wallet address change rejected for user=${user._id} reason=${confirmed.message}`,
      );

      return res.status(confirmed.status).json({ message: confirmed.message });
    }
  }

  // Pending withdrawal ထဲက address ကို အခုပြောင်းရင် admin approve လုပ်တဲ့အခါ
  // နောက် address ကို ပို့မိမယ် — ဒါကြောင့် မှုတစ်ခုပြီးမှ ပြောင်းခွင့်ပေးတယ်။
  if (await hasPendingWithdrawal(user._id)) {
    return res.status(409).json({ message: PENDING_WITHDRAWAL_MESSAGE });
  }

  user.walletAddress = walletAddress;
  await user.save();

  console.log(
    `[audit] admin=${req.user._id} updated wallet address for user=${user._id}`,
  );

  res.json({ message: "Wallet address updated", walletAddress });
});

// User က password မေ့ပြီး admin ဆီ တောင်းတဲ့အခါ — အဟောင်း password ကို
// မမေးဘူး (bcrypt hash ဖြစ်လို့ ဖော်လို့မရ)။ Admin authority ကို adminOnly middleware
// က သက်သေပြပြီး tokenVersion တက်သွားလို့ device အားလုံး 401 နဲ့ ထွက်သွားမယ်။
exports.resetUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  // register/login နှစ်ခုလုံး normalizePassword သုံးထားလို့ ဒီမှာ မလုပ်ရင်
  // trim ပြီး တိုသွားတဲ့ password နဲ့ user က login မရတဲ့ lockout ဖြစ်တယ်။
  const password = normalizePassword(parsed.data.password);

  if (password.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters",
    });
  }

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Admin account တွေကို admin အချင်းချင်း reset မလုပ်နိုင် — မှားယွင်းပဋိပက္ခ
  // ဖြစ်ရင် panel ကို အားလုံး ပိတ်သွားနိုင်လို့ self change လမ်းပဲ ထားတယ်။
  if (user.role === "admin") {
    return res.status(403).json({
      message: "Admin passwords must be changed from the admin's own account",
    });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  console.log(
    `[audit] admin=${req.user._id} reset password for user=${user._id}`,
  );

  res.json({ message: "Password updated" });
});

// ငွေအမှားအယွင်း (deposit မတင်ရ, withdraw ပြန်ပို့ရ) တွေအတွက် admin လက်ဖြင့် ညှိခြင်း။
// Balance + ledger ကို transaction တစ်ခုတည်းမှာ ရေးတယ် — ledger မပါတဲ့
// balance ပြောင်းလဲမှု မဖြစ်အောင်။
exports.adjustUserBalance = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const parsed = adjustBalanceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { type, reason } = parsed.data;
  const deltaCents = toCents(parsed.data.amount);

  if (deltaCents === 0n) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }

  const session = await mongoose.startSession();

  try {
    let adjusted;

    await session.withTransaction(async () => {
      const user = await User.findOne({
        _id: id,
        status: { $ne: "burned" },
      }).session(session);

      if (!user) {
        const err = new Error("User unavailable");
        err.status = 409;
        throw err;
      }

      const before = toCents(user.balance.toString());
      const after = type === "credit" ? before + deltaCents : before - deltaCents;

      if (after < 0n) {
        const err = new Error("Insufficient balance");
        err.status = 409;
        throw err;
      }

      user.balance = decimal(after);
      await user.save({ session });

      await WalletLedger.create(
        [
          {
            userId: user._id,
            type,
            amount: decimal(deltaCents),
            balance: decimal(after),
            reference: String(req.user._id),
            note: reason
              ? `${WALLET_NOTES.ADMIN_ADJUST}: ${reason}`
              : WALLET_NOTES.ADMIN_ADJUST,
          },
        ],
        { session },
      );

      adjusted = { userId: String(user._id), after };
    });

    emitToAdmins("balance:updated", {
      userId: adjusted.userId,
      balance: fromCents(adjusted.after),
      reason: "admin_adjust",
    });
    emitToUser(adjusted.userId, "balance:updated", {
      balance: fromCents(adjusted.after),
      reason: "admin_adjust",
    });

    res.json({ balance: fromCents(adjusted.after) });
  } finally {
    await session.endSession();
  }
});

const STATS_CACHE_TTL_MS = 15000;
const statsCache = new Map();

exports.stats = asyncHandler(async (req, res) => {
  const isOwner = req.user.role === "owner";
  const cacheKey = `${req.user.role}:${req.user._id}`;
  const cached = statsCache.get(cacheKey);

  // cache hit မှာ ownerUserIds (distinct) ကို မ run သင့်ဘူး — အဲဒါက
  // ဒီ endpoint ရဲ့ အထဲက အစျေးအကြီးဆုံး query ဖြစ်တယ်။
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ stats: cached.stats });
  }

  const userIds = isOwner ? await ownerUserIds(req.user._id) : null;

  const scopeTx = (extra = {}) => {
    if (!isOwner) return extra;
    return { ...extra, userId: { $in: userIds } };
  };

  const [userStats, productCount, transactionStats, planStats] = await Promise.all([
    isOwner
      ? User.countDocuments({ ownerId: req.user._id })
      : User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              totalOwners: { $sum: { $cond: [{ $eq: ["$role", "owner"] }, 1, 0] } },
            },
          },
        ]),
    Product.countDocuments({}),
    Transaction.aggregate([
      { $match: scopeTx({ type: { $in: ["deposit", "withdraw"] } }) },
      {
        $group: {
          _id: null,
          pendingDeposits: {
            $sum: { $cond: [{ $and: [{ $eq: ["$type", "deposit"] }, { $eq: ["$status", "pending"] }] }, 1, 0] },
          },
          pendingWithdraws: {
            $sum: { $cond: [{ $and: [{ $eq: ["$type", "withdraw"] }, { $eq: ["$status", "pending"] }] }, 1, 0] },
          },
          acceptedVolume: {
            $sum: { $cond: [{ $and: [{ $eq: ["$type", "deposit"] }, { $eq: ["$status", "accepted"] }] }, "$amount", 0] },
          },
        },
      },
    ]),
    OrderPlan.aggregate([
      { $match: isOwner ? { userId: { $in: userIds } } : {} },
      {
        $group: {
          _id: null,
          totalPlans: { $sum: 1 },
          generatedPlans: { $sum: { $cond: [{ $eq: ["$status", "generated"] }, 1, 0] } },
          completedPlans: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const stats = {
    totalUsers: isOwner ? userStats : userStats[0]?.totalUsers ?? 0,
    totalOwners: isOwner ? 1 : userStats[0]?.totalOwners ?? 0,
    totalProducts: productCount,
    pendingDeposits: transactionStats[0]?.pendingDeposits ?? 0,
    pendingWithdraws: transactionStats[0]?.pendingWithdraws ?? 0,
    acceptedVolume: transactionStats[0]?.acceptedVolume ?? 0,
    totalPlans: planStats[0]?.totalPlans ?? 0,
    generatedPlans: planStats[0]?.generatedPlans ?? 0,
    completedPlans: planStats[0]?.completedPlans ?? 0,
  };

  statsCache.set(cacheKey, {
    stats,
    expiresAt: Date.now() + STATS_CACHE_TTL_MS,
  });

  res.json({ stats });
});
