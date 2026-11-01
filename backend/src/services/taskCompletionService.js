const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
const WalletLedger = require("../models/WalletLedger");
const LuckyOrderConfig = require("../models/LuckyOrderConfig");
const OrderPlan = require("../models/OrderPlan");
const Transaction = require("../models/Transaction");
const { toCents, fromCents, decimal } = require("../utils/money");
const { httpError } = require("../utils/httpError");
const { DEFAULT_INVITATION_CODE } = require("../config/invitation");
const { emitToAdmins, emitToUser } = require("../socket");
const { WALLET_NOTES } = require("../constants/walletNotes");

function referralBasisPoints() {
  const raw = process.env.REFERRAL_BONUS_PERCENT ?? "10";
  const percent = Number(raw);

  if (!Number.isFinite(percent) || percent < 0) {
    return 0n;
  }

  return BigInt(Math.round(percent * 100));
}

async function resolveReferrer(user, session) {
  const code = user.referredByCode;

  if (!code || code === DEFAULT_INVITATION_CODE) {
    return null;
  }

  const referrer = await User.findOne({
    $or: [{ invitationCode: code }, { ownerInviteCode: code }],
    status: { $ne: "burned" },
  }).session(session);

  if (!referrer || referrer._id.equals(user._id)) {
    return null;
  }

  return referrer;
}

async function loadAssignedTask(taskId, session) {
  const task = await Task.findOne({
    _id: taskId,
    status: "assigned",
  }).session(session);

  if (!task) {
    throw httpError(
      409,
      "Task not found, not matched yet, or already completed",
    );
  }

  return task;
}

async function assertCanComplete(task, actor, session) {
  if (actor.role === "user" && !task.userId.equals(actor._id)) {
    throw httpError(403, "Forbidden");
  }

  if (actor.role === "owner") {
    const taskUser = await User.findById(task.userId).session(session);

    if (!taskUser || !taskUser.ownerId || !taskUser.ownerId.equals(actor._id)) {
      throw httpError(403, "Forbidden");
    }
  }
}

async function loadSequentialPlan(task, session) {
  if (!task.orderPlanId) {
    return null;
  }

  const plan = await OrderPlan.findById(task.orderPlanId).session(session);

  if (!plan) {
    throw httpError(409, "Order plan not found");
  }

  if (task.orderNumber !== plan.completedCount + 1) {
    throw httpError(409, "Orders must be completed in sequence");
  }

  return plan;
}

async function loadActiveUser(userId, session) {
  const user = await User.findOne({
    _id: userId,
    status: { $ne: "burned" },
  }).session(session);

  if (!user) {
    throw httpError(409, "User unavailable");
  }

  return user;
}

// Lucky order ရဲ့ deposit ကို ကိုင်တွယ်တယ်။ Plan ပါရင် accepted deposit
// transaction ကို claim လုပ်ပြီး plan base ကို တိုးတယ် (balance ကနေ မဖြတ်ဘူး)။
// Plan မပါတဲ့ legacy lucky order ကတော့ balance ကနေ ဖြတ်တယ်။
async function settleLuckyDeposit({ plan, task, user, balance, session }) {
  if (plan && task.isLuckyOrder) {
    const luckyPosition = plan.luckyPositions.find(
      (position) => position.orderNumber === task.orderNumber,
    );

    if (!luckyPosition) {
      throw httpError(409, "Lucky order configuration is missing");
    }

    const required = toCents(luckyPosition.requiredDeposit.toString());

    if (required > 0n) {
      const claimed = await Transaction.findOneAndUpdate(
        {
          userId: user._id,
          type: "deposit",
          status: "accepted",
          amount: decimal(required),
          allocation: null,
          _id: { $ne: plan.initialDepositTxId },
        },
        {
          $set: {
            allocation: { taskId: task._id, allocatedAt: new Date() },
          },
        },
        { session, returnDocument: "after" },
      );

      if (!claimed) {
        throw httpError(
          400,
          `An accepted deposit of exactly ${fromCents(required)} is required for this lucky order`,
        );
      }
    }

    plan.currentBase = decimal(
      toCents(plan.currentBase.toString()) + required,
    );

    return { deposit: 0n, balanceAfterDeposit: balance };
  }

  if (!task.isLuckyOrder) {
    return { deposit: 0n, balanceAfterDeposit: balance };
  }

  const config = await LuckyOrderConfig.findOne({
    userId: task.userId,
    orderNumber: task.orderNumber,
  }).session(session);

  if (!config) {
    throw httpError(409, "Lucky order configuration is missing");
  }

  const deposit = toCents(config.requiredDeposit.toString());

  if (balance < deposit) {
    throw httpError(400, "Insufficient balance for lucky order deposit");
  }

  return { deposit, balanceAfterDeposit: balance - deposit };
}

async function creditReferralBonus({ user, task, commission, session }) {
  const referrer = await resolveReferrer(user, session);

  if (!referrer) {
    return { referrer: null, bonus: 0n, referrerBalance: null };
  }

  const bonus = (commission * referralBasisPoints()) / 10000n;

  if (bonus <= 0n) {
    return { referrer, bonus: 0n, referrerBalance: null };
  }

  const referrerBalance = toCents(referrer.balance.toString()) + bonus;
  referrer.balance = decimal(referrerBalance);
  await referrer.save({ session });

  await WalletLedger.create(
    [
      {
        userId: referrer._id,
        type: "credit",
        amount: decimal(bonus),
        balance: decimal(referrerBalance),
        reference: String(task._id),
        note: WALLET_NOTES.REFERRAL_BONUS,
      },
    ],
    { session },
  );

  return { referrer, bonus, referrerBalance };
}

async function writeLedgerEntries({
  user,
  task,
  deposit,
  balanceAfterDeposit,
  commission,
  balance,
  session,
}) {
  if (deposit > 0n) {
    await WalletLedger.create(
      [
        {
          userId: user._id,
          type: "debit",
          amount: decimal(deposit),
          balance: decimal(balanceAfterDeposit),
          reference: String(task._id),
          note: WALLET_NOTES.LUCKY_ORDER_DEPOSIT,
        },
      ],
      { session },
    );
  }

  await WalletLedger.create(
    [
      {
        userId: user._id,
        type: "credit",
        amount: decimal(commission),
        balance: decimal(balance),
        reference: String(task._id),
        note: WALLET_NOTES.TASK_COMMISSION,
      },
    ],
    { session },
  );
}

function emitCompletionEvents(out) {
  emitToAdmins("task:completed", {
    taskId: String(out.task._id),
    userId: String(out.userId),
    orderNumber: out.task.orderNumber,
    commission: fromCents(out.commission),
    luckyDeposit: fromCents(out.deposit),
  });

  // ကိုယ်ပိုင်ကို real-time (grab page counters)
  emitToUser(out.userId, "order:completed", {
    taskId: String(out.task._id),
    orderNumber: out.task.orderNumber,
    commission: fromCents(out.commission),
    balance: fromCents(out.balance),
  });

  emitToAdmins("balance:updated", {
    userId: String(out.userId),
    balance: fromCents(out.balance),
    reason: "task_completed",
  });

  if (out.referrerId) {
    emitToAdmins("balance:updated", {
      userId: String(out.referrerId),
      balance: fromCents(out.referrerBalance),
      reason: "referral_bonus",
    });
  }

  if (out.plan) {
    emitToAdmins("order:progress", {
      planId: String(out.plan._id),
      userId: String(out.plan.userId),
      completedCount: out.plan.completedCount,
      totalOrders: out.plan.totalOrders,
    });

    if (out.plan.status === "completed") {
      emitToAdmins("order:plan_completed", {
        planId: String(out.plan._id),
        userId: String(out.plan.userId),
      });
    }
  }
}

async function completeTask(taskId, actor) {
  const session = await mongoose.startSession();

  try {
    let out;

    await session.withTransaction(async () => {
      const task = await loadAssignedTask(taskId, session);

      await assertCanComplete(task, actor, session);

      const plan = await loadSequentialPlan(task, session);
      const user = await loadActiveUser(task.userId, session);

      const { deposit, balanceAfterDeposit } = await settleLuckyDeposit({
        plan,
        task,
        user,
        balance: toCents(user.balance.toString()),
        session,
      });

      const commission = toCents(task.commission.toString());
      const balance = balanceAfterDeposit + commission;

      const { referrer, bonus, referrerBalance } = await creditReferralBonus({
        user,
        task,
        commission,
        session,
      });

      user.balance = decimal(balance);
      await user.save({ session });

      await writeLedgerEntries({
        user,
        task,
        deposit,
        balanceAfterDeposit,
        commission,
        balance,
        session,
      });

      task.status = "completed";
      task.completedAt = new Date();
      await task.save({ session });

      if (plan) {
        plan.completedCount += 1;

        if (plan.completedCount === plan.totalOrders) {
          plan.status = "completed";
        }

        await plan.save({ session });
      }

      out = {
        task,
        userId: user._id,
        balance,
        deposit,
        commission,
        referrerId: referrer && bonus > 0n ? referrer._id : null,
        referrerBalance,
        plan,
      };
    });

    emitCompletionEvents(out);

    return out;
  } finally {
    await session.endSession();
  }
}

module.exports = { completeTask };
