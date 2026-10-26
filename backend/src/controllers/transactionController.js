const { z } = require("zod");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const OrderPlan = require("../models/OrderPlan");
const asyncHandler = require("../utils/asyncHandler");
const { toCents, decimal, fromCents } = require("../utils/money");
const { emitToAdmins } = require("../socket");
const { normalizePassword } = require("../utils/phone");
const { isImageKitUrl } = require("./uploadController");

const createSchema = z.object({
  type: z.enum(["deposit", "withdraw"]),
  amount: z.string().min(1),
  // Screenshot ကို ImageKit URL အဖြစ်သာ လက်ခံမယ် — base64 bytes မသိမ်းတော့ဘူး။
  proofScreenshot: z.string().max(1000).optional(),
  // Withdrawal အတွက်သာ — user ရဲ့ login password ကို verify လုပ်မယ်။
  password: z.string().max(100).optional(),
});

const rejectSchema = z.object({
  rejectionReason: z.string().min(1).max(500),
});

exports.create = asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { type, amount, proofScreenshot, password } = parsed.data;

  let amountCents;
  try {
    amountCents = toCents(amount);
    if (amountCents <= 0n) throw new Error();
  } catch {
    return res.status(400).json({
      message: "Invalid amount",
    });
  }

  if (type === "withdraw") {
    const user = await User.findById(req.user._id).select("+passwordHash");

    if (!user) {
      return res.status(409).json({ message: "User unavailable" });
    }

    // Login password ကို verify လုပ်မယ် — JWT ရှိရုံနဲ့ withdraw
    // လုပ်လို့ရတာ မလုံလောက်ဘူး။
    const withdrawalPassword = normalizePassword(password);

    if (!withdrawalPassword) {
      return res.status(400).json({
        message: "Password is required for withdrawal",
      });
    }

    const valid = await bcrypt.compare(withdrawalPassword, user.passwordHash);

    if (!valid) {
      return res.status(401).json({
        message: "Incorrect password",
      });
    }

    if (!user.walletAddress) {
      return res.status(400).json({
        message: "A wallet address is required before requesting a withdrawal",
      });
    }

    const openPlan = await OrderPlan.findOne({
      userId: req.user._id,
      status: { $ne: "completed" },
    });

    if (openPlan) {
      return res.status(409).json({
        message:
          "Withdrawals are available only after all orders in your order plan are completed",
      });
    }
  }

  if (
    proofScreenshot !== undefined &&
    proofScreenshot !== null &&
    proofScreenshot !== "" &&
    !isImageKitUrl(proofScreenshot)
  ) {
    return res.status(400).json({
      message: "Deposit proof must be an uploaded ImageKit image URL",
    });
  }

  const transaction = await Transaction.create({
    userId: req.user._id,
    type,
    amount: decimal(amountCents),
    proofScreenshot: type === "deposit" ? proofScreenshot || null : null,
    status: "pending",
  });

  res.status(201).json({ transaction });
});

exports.myTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find({
    userId: req.user._id,
  }).sort({ createdAt: -1 });

  res.json({ transactions });
});

exports.adminList = asyncHandler(async (req, res) => {
  const filter = {};
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.type) {
    filter.type = req.query.type;
  }

  // Owner က ကိုယ့် downline user တွေရဲ့ transaction တွေကိုသာ မြင်ရမယ်။
  if (req.user.role === "owner") {
    const ownerUserIds = await User.find({ ownerId: req.user._id }).distinct(
      "_id",
    );
    filter.userId = { $in: ownerUserIds };
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .populate("userId", "name phone walletAddress")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    transactions,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// Plans page အတွက် user တစ်ခုလုံးရဲ့ deposit အခြေပြန်ကို တစ်ခါတည်း ပြန်ပေးမယ်။
// adminList က "အသစ်ဆုံး 100 ခု" ပဲ ပြောင်းလဲနိုင်လို့ အဟောင်း deposit တွေ ကြောင်း
// ကြောင်း ပျောက်နေတယ် — ဒါကြောင့် "No accepted deposit" လို့ ပြသမယ့် အခြေပြန်အမှားတစ်ခု ဖြစ်တယ်။
exports.adminDepositSummary = asyncHandler(async (req, res) => {
  const userIds = [
    ...new Set(
      String(req.query.userIds || "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => mongoose.isValidObjectId(value)),
    ),
  ].slice(0, 100);

  if (userIds.length === 0) {
    return res.json({ deposits: [] });
  }

  const filter = {
    userId: { $in: userIds },
    type: "deposit",
    status: { $in: ["accepted", "pending"] },
  };

  // Owner က ကိုယ့် downline မဟုတ်တဲ့ user ကို မမြင်ရဘူး။
  let scopedIds = userIds;

  if (req.user.role === "owner") {
    const ownerUserIds = await User.find({ ownerId: req.user._id }).distinct(
      "_id",
    );
    const allowed = new Set(ownerUserIds.map((id) => String(id)));
    scopedIds = userIds.filter((id) => allowed.has(id));
    filter.userId = { $in: scopedIds };
  }

  // Balance round အတွက် user ရဲ့ လက်ရှိ balance — owner scope အတွင်းပဲ ပြမယ်။
  const balanceUsers = await User.find({ _id: { $in: scopedIds } })
    .select("balance")
    .lean();
  const balanceByUser = new Map(
    balanceUsers.map((user) => [
      String(user._id),
      user.balance ? String(user.balance) : "0.00",
    ]),
  );

  const transactions = await Transaction.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(500)
    .select("userId amount status allocation");

  // Round တစ်ခုမှာ အသုံးပြုပြီးသား deposit တွေကို အသစ် round အတွက်
  // ပြန်သုံးလို့ မရဘူး။
  const usedDepositIds = new Set(
    (
      await OrderPlan.find({
        initialDepositTxId: { $in: transactions.map((tx) => tx._id) },
      })
        .select("initialDepositTxId")
        .lean()
    ).map((plan) => String(plan.initialDepositTxId)),
  );

  const byUser = new Map(
    userIds.map((id) => [
      id,
      {
        userId: id,
        accepted: null,
        freeAccepted: null,
        pending: [],
        balance: balanceByUser.get(id) ?? "0.00",
      },
    ]),
  );

  for (const tx of transactions) {
    const entry = byUser.get(String(tx.userId));
    if (!entry) continue;

    const deposit = { _id: String(tx._id), amount: String(tx.amount) };

    if (tx.status === "accepted") {
      if (!entry.accepted) entry.accepted = deposit;

      const used =
        usedDepositIds.has(String(tx._id)) || Boolean(tx.allocation);
      if (!used && !entry.freeAccepted) entry.freeAccepted = deposit;
    } else if (entry.pending.length < 5) {
      entry.pending.push(deposit);
    }
  }

  res.json({ deposits: [...byUser.values()] });
});

exports.adminAccept = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid transaction ID" });
  }

  const transaction = await Transaction.findById(id);

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  if (transaction.status !== "pending") {
    return res.status(409).json({ message: "Transaction already processed" });
  }

  if (req.user.role === "owner") {
    const ownerUser = await User.findById(transaction.userId);

    if (
      !ownerUser ||
      !ownerUser.ownerId ||
      !ownerUser.ownerId.equals(req.user._id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  const session = await mongoose.startSession();

  try {
    let updatedBalanceCents;
    let claimed;

    await session.withTransaction(async () => {
      // Status ကို session အတွင်းမှာပဲ atomic အနေနဲ့ ယူမယ် —
      // တစ်ချက်နဲ့ နှစ်ယောက် တစ်ပြိုင်နေ လျှင် double credit မဖြစ်စေဘူး။
      claimed = await Transaction.findOneAndUpdate(
        { _id: id, status: "pending" },
        {
          $set: {
            status: "accepted",
            reviewedBy: req.user._id,
            reviewedAt: new Date(),
          },
        },
        { session, returnDocument: "after" },
      );

      if (!claimed) {
        const err = new Error("Transaction already processed");
        err.status = 409;
        throw err;
      }

      const user = await User.findOne({
        _id: claimed.userId,
        status: { $ne: "burned" },
      }).session(session);

      if (!user) {
        const err = new Error("User unavailable");
        err.status = 409;
        throw err;
      }

      const amountCents = toCents(claimed.amount.toString());
      const before = toCents(user.balance.toString());

      if (claimed.type === "deposit") {
        user.balance = decimal(before + amountCents);
        updatedBalanceCents = before + amountCents;
      } else {
        if (before < amountCents) {
          const err = new Error("Insufficient balance");
          err.status = 400;
          throw err;
        }
        user.balance = decimal(before - amountCents);
        updatedBalanceCents = before - amountCents;
      }

      await user.save({ session });
    });

    emitToAdmins("transaction:updated", {
      transactionId: String(claimed._id),
      userId: String(claimed.userId),
      type: claimed.type,
      amount: fromCents(toCents(claimed.amount.toString())),
      status: "accepted",
    });

    emitToAdmins("balance:updated", {
      userId: String(claimed.userId),
      balance: fromCents(updatedBalanceCents),
      reason: "transaction_accepted",
    });

    res.json({ transaction: claimed });
  } finally {
    await session.endSession();
  }
});

exports.adminReject = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid transaction ID" });
  }

  const parsed = rejectSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const transaction = await Transaction.findById(id);

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  if (transaction.status !== "pending") {
    return res.status(409).json({ message: "Transaction already processed" });
  }

  if (req.user.role === "owner") {
    const ownerUser = await User.findById(transaction.userId);

    if (
      !ownerUser ||
      !ownerUser.ownerId ||
      !ownerUser.ownerId.equals(req.user._id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  // Status ကို atomic အနေနဲ့ ပြောင်းမယ် — တစ်ချက်နဲ့ နှစ်ယောက် တစ်ပြိုင်နေ လျှင် double process မဖြစ်စေဘူး။
  const claimed = await Transaction.findOneAndUpdate(
    { _id: id, status: "pending" },
    {
      $set: {
        status: "rejected",
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
      },
    },
    { returnDocument: "after" },
  );

  if (!claimed) {
    return res.status(409).json({ message: "Transaction already processed" });
  }

  emitToAdmins("transaction:updated", {
    transactionId: String(claimed._id),
    userId: String(claimed.userId),
    type: claimed.type,
    amount: fromCents(toCents(claimed.amount.toString())),
    status: "rejected",
  });

  res.json({ transaction: claimed });
});
