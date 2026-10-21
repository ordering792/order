const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
const WalletLedger = require("../models/WalletLedger");
const LuckyOrderConfig = require("../models/LuckyOrderConfig");
const OrderPlan = require("../models/OrderPlan");
const Transaction = require("../models/Transaction");
const { toCents, fromCents, decimal } = require("../utils/money");
const { emitToAdmins } = require("../socket");

const DEFAULT_INVITATION_CODE =
  process.env.DEFAULT_INVITATION_CODE || "MASTER2024";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

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

async function completeTask(taskId, actor) {
  const session = await mongoose.startSession();

  try {
    let out;

    await session.withTransaction(async () => {
      const task = await Task.findOne({
        _id: taskId,
        status: "pending",
      }).session(session);

      if (!task) {
        throw httpError(409, "Task not found or already completed");
      }

      if (actor.role === "user" && !task.userId.equals(actor._id)) {
        throw httpError(403, "Forbidden");
      }

      if (actor.role === "owner") {
        const taskUser = await User.findById(task.userId).session(session);

        if (
          !taskUser ||
          !taskUser.ownerId ||
          !taskUser.ownerId.equals(actor._id)
        ) {
          throw httpError(403, "Forbidden");
        }
      }

      let plan = null;

      if (task.orderPlanId) {
        plan = await OrderPlan.findById(task.orderPlanId).session(session);

        if (!plan) {
          throw httpError(409, "Order plan not found");
        }

        if (task.orderNumber !== plan.completedCount + 1) {
          throw httpError(409, "Orders must be completed in sequence");
        }
      }

      const user = await User.findOne({
        _id: task.userId,
        status: { $ne: "burned" },
      }).session(session);

      if (!user) {
        throw httpError(409, "User unavailable");
      }

      let balance = toCents(user.balance.toString());
      let deposit = 0n;
      let balanceAfterDeposit = balance;

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
      } else if (task.isLuckyOrder) {
        const config = await LuckyOrderConfig.findOne({
          userId: task.userId,
          orderNumber: task.orderNumber,
        }).session(session);

        if (!config) {
          throw httpError(409, "Lucky order configuration is missing");
        }

        deposit = toCents(config.requiredDeposit.toString());

        if (balance < deposit) {
          throw httpError(400, "Insufficient balance for lucky order deposit");
        }

        balance -= deposit;
        balanceAfterDeposit = balance;
      }

      const commission = toCents(task.commission.toString());
      balance += commission;

      const referrer = await resolveReferrer(user, session);
      let bonus = 0n;
      let referrerBalance = null;

      if (referrer) {
        bonus = (commission * referralBasisPoints()) / 10000n;

        if (bonus > 0n) {
          referrerBalance = toCents(referrer.balance.toString()) + bonus;
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
                note: "Referral bonus",
              },
            ],
            { session },
          );
        }
      }

      user.balance = decimal(balance);
      await user.save({ session });

      if (deposit > 0n) {
        await WalletLedger.create(
          [
            {
              userId: user._id,
              type: "debit",
              amount: decimal(deposit),
              balance: decimal(balanceAfterDeposit),
              reference: String(task._id),
              note: "Lucky order deposit",
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
            note: "Task commission",
          },
        ],
        { session },
      );

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

    emitToAdmins("task:completed", {
      taskId: String(out.task._id),
      userId: String(out.userId),
      orderNumber: out.task.orderNumber,
      commission: fromCents(out.commission),
      luckyDeposit: fromCents(out.deposit),
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

    return out;
  } finally {
    await session.endSession();
  }
}

module.exports = { completeTask };
