const mongoose = require("mongoose");
const { z } = require("zod");
const Task = require("../models/Task");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const OrderPlan = require("../models/OrderPlan");
const WalletLedger = require("../models/WalletLedger");
const asyncHandler = require("../utils/asyncHandler");
const { toCents, decimal } = require("../utils/money");
const { httpError } = require("../utils/httpError");
const { COMMISSION_BASIS_POINTS } = require("../services/orderSelection");
const { emitToUser } = require("../socket");

const ratingSchema = z
  .object({
    rating: z.number().int().min(1).max(5).nullish(),
    feedback: z.string().max(1000).nullish(),
  })
  .default({});

// Order Detail modal အတွက် လိုအပ်တဲ့ data (reference UI နဲ့တူညီအောင်)
function serializeGrabTask(task, luckyPosition) {
  const priceCents = toCents(task.price.toString());
  const commissionCents = toCents(task.commission.toString());
  const depositCents = luckyPosition
    ? toCents(luckyPosition.requiredDeposit.toString())
    : 0n;

  return {
    id: task._id,
    orderNumber: task.orderNumber,
    orderId: `ORD-${String(task.orderNumber).padStart(3, "0")}`,
    productName: task.productName,
    productImage: task.imageUrl,
    description: task.description || task.usage || "",
    category: task.category || "",
    code: task.code || "",
    price: decimal(priceCents).toString(),
    profit: decimal(commissionCents).toString(),
    requireDeposit: decimal(depositCents).toString(),
    paidDeposit: decimal(0n).toString(),
    isLuckyOrder: Boolean(task.isLuckyOrder),
    totalAmount: decimal(priceCents + commissionCents + depositCents).toString(),
    status: task.status,
    assignedAt: task.assignedAt,
    submittedAt: task.submittedAt,
    rating: task.rating,
    feedback: task.feedback,
  };
}

async function getUserPlan(userId) {
  return (
    (await OrderPlan.findOne({ userId, status: { $ne: 'completed' } }).sort({ createdAt: -1 })) ||
    (await OrderPlan.findOne({ userId }).sort({ createdAt: -1 }))
  );
}

async function getLuckyPosition(plan, orderNumber) {
  if (!plan) return null;
  return (
    plan.luckyPositions.find((position) => position.orderNumber === orderNumber) ||
    null
  );
}

// "available" = match လုပ်ရန် ကျန်ရှိ order။
// Legacy "pending" (status ပြောင်းမီး ဖန်တီးထားတဲ့ task) ကိုလည်း အလုပ်လုပ်မယ်။
const AVAILABLE_STATUSES = ["available", "pending"];

async function countSummary(userId) {
  const plan = await getUserPlan(userId);
  const totalOrders = plan?.totalOrders ?? 0;
  // Plan ရှိရင် ဒီ plan ရဲ့ task တွေကိုပဲ ရေတွက်တယ် — မပြီးတဲ့ round က
  // count တွေက ယခင် round တွေနဲ့ ရောသွားလို့ မရဘူး။ plan မရှိတဲ့ legacy
  // user အတွက်တော့ အားလုံးကို ရေတွက်မယ်။
  const scope = plan ? { userId, orderPlanId: plan._id } : { userId };

  const [completedCount, undoneCount, availableCount] = await Promise.all([
    Task.countDocuments({ ...scope, status: "completed" }),
    Task.countDocuments({ ...scope, status: "assigned" }),
    Task.countDocuments({ ...scope, status: { $in: AVAILABLE_STATUSES } }),
  ]);

  return {
    plan,
    totalOrders,
    completedCount,
    undoneCount,
    remainingCount: availableCount,
  };
}

// /grab page အတွက် summary (balance, counters, active order)
exports.grabSummary = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { plan, totalOrders, completedCount, undoneCount, remainingCount } =
    await countSummary(req.user._id);

  const [commissionAgg, activeOrder] = await Promise.all([
    WalletLedger.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: "credit",
          note: "Task commission",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Task.findOne({
      userId: req.user._id,
      status: "assigned",
      ...(plan ? { orderPlanId: plan._id } : {}),
    }).sort({ orderNumber: 1 }),
  ]);

  const luckyPosition = activeOrder
    ? await getLuckyPosition(plan, activeOrder.orderNumber)
    : null;

  res.json({
    summary: {
      balance: user.balance ? user.balance.toString() : "0.00",
      totalCommission: commissionAgg[0] ? String(commissionAgg[0].total) : "0.00",
      freezeBalance: "0.00",
      totalOrderNumber: totalOrders,
      vipLevel: "FREE VIP",
      commissionRate: `${(Number(COMMISSION_BASIS_POINTS) / 100).toFixed(2)}%`,
      completedCount,
      remainingCount,
      undoneCount,
      activeOrder: activeOrder
        ? serializeGrabTask(activeOrder, luckyPosition)
        : null,
    },
  });
});

// "Begin Matching" — နောက် order တစ်ခု ပေးမယ် (assign လုပ်ပြီး detail ပြမယ်)
exports.match = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { plan } = await countSummary(req.user._id);

  if (!plan) {
    throw httpError(404, "No order plan found — deposit first");
  }

  if (plan.status === "completed") {
    throw httpError(409, "All orders are already completed");
  }

  // ရှိပြီးသား active order ရှိရင် အဲဒါကိုပဲ ပြမယ် (idempotent)
  let task = await Task.findOne({
    userId: req.user._id,
    orderPlanId: plan._id,
    status: "assigned",
  }).sort({ orderNumber: 1 });

  if (!task) {
    task = await Task.findOne({
      userId: req.user._id,
      orderPlanId: plan._id,
      status: { $in: AVAILABLE_STATUSES },
    })
      .sort({ orderNumber: 1 })
      .then((found) =>
        found
          ? Task.findOneAndUpdate(
              { _id: found._id, status: { $in: AVAILABLE_STATUSES } },
              { $set: { status: "assigned", assignedAt: new Date() } },
              { returnDocument: "after" },
            )
          : null,
      );
  }

  if (!task) {
    throw httpError(409, "No available orders left to match");
  }

  const luckyPosition = await getLuckyPosition(plan, task.orderNumber);
  const detail = serializeGrabTask(task, luckyPosition);

  const depositCents = toCents(detail.requireDeposit);

  // Lucky deposit ကို completeTask က accepted ဖြစ်ပြီး မရောင်းရသေးတဲ့
  // requiredDeposit တိတိကျကျ တူ deposit tx တစ်ခုနဲ့ပဲ ဖြည်တယ် — balance
  // လုံလုံရုံနဲ့ မဖွင့်နိုင်ဘူး။ ဒါကြောင့် preflight က claimability ကို စစ်မယ်။
  let needsDeposit = false;
  let shortByCents = 0n;

  if (depositCents > 0n) {
    const claimable = await Transaction.exists({
      userId: req.user._id,
      type: "deposit",
      status: "accepted",
      amount: decimal(depositCents),
      allocation: null,
      _id: { $ne: plan.initialDepositTxId },
    });

    needsDeposit = !claimable;
    shortByCents = claimable ? 0n : depositCents;
  }

  res.json({
    order: detail,
    balance: user.balance ? user.balance.toString() : "0.00",
    needsDeposit,
    shortBy: decimal(shortByCents).toString(),
  });
});

// "Submit Order" (grab modal) — rating/feedback သိမ်းပြီး /orders ကို ပို့
exports.submit = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid task ID");
  }

  const parsed = ratingSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const task = await Task.findOne({
    _id: id,
    userId: req.user._id,
    status: "assigned",
  });

  if (!task) {
    throw httpError(409, "Order not found, not matched yet, or already completed");
  }

  const updates = { submittedAt: new Date() };

  if (parsed.data.rating !== undefined && parsed.data.rating !== null) {
    updates.rating = parsed.data.rating;
  }
  if (parsed.data.feedback) {
    updates.feedback = parsed.data.feedback;
  }

  const updated = await Task.findByIdAndUpdate(task._id, updates, {
    returnDocument: "after",
  });

  emitToUser(req.user._id, "order:submitted", {
    taskId: String(updated._id),
    orderNumber: updated.orderNumber,
  });

  res.json({ task: updated });
});

// /orders page — match/submit လုပ်ပြီးနောက် order list (assigned + completed သာ)
exports.myOrders = asyncHandler(async (req, res) => {
  const plan = await getUserPlan(req.user._id);

  const tasks = await Task.find({
    userId: req.user._id,
    // Plan ရှိရင် ဒီ plan ရဲ့ order တွေကိုပဲ ပြတယ် — plan ဆံသတ်ရင်
    // ORD-001 စသဖြင့် နံပါတ် ပြန်ထပ်ပြီး စာရင်း ရှည်သွားလို့ မရဘူး။
    ...(plan ? { orderPlanId: plan._id } : {}),
    status: { $in: ["assigned", "completed"] },
  })
    .sort({ orderNumber: 1 })
    .lean();

  res.json({
    tasks,
    plan: plan
      ? {
          _id: plan._id,
          totalOrders: plan.totalOrders,
          completedCount: plan.completedCount,
          status: plan.status,
        }
      : null,
  });
});
