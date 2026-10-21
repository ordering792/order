const { z } = require("zod");
const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const OrderPlan = require("../models/OrderPlan");
const asyncHandler = require("../utils/asyncHandler");
const { toCents, decimal, fromCents } = require("../utils/money");
const { emitToAdmins } = require("../socket");

const createSchema = z.object({
  type: z.enum(["deposit", "withdraw"]),
  amount: z.string().min(1),
  // Screenshot က data URL (base64) ဖြစ်လို့ size ကို ကန့်သတ်ထားမယ်။
  proofScreenshot: z.string().max(2_000_000).optional(),
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

  const { type, amount, proofScreenshot } = parsed.data;

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
    const user = await User.findById(req.user._id);

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

  const transaction = await Transaction.create({
    userId: req.user._id,
    type,
    amount: decimal(amountCents),
    proofScreenshot: proofScreenshot || null,
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

  const transactions = await Transaction.find(filter)
    .populate("userId", "name phone walletAddress")
    .populate("reviewedBy", "name")
    .sort({ createdAt: -1 });

  res.json({ transactions });
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
      userId: String(transaction.userId),
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
