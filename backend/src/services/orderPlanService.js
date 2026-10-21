const mongoose = require("mongoose");
const User = require("../models/User");
const Task = require("../models/Task");
const Product = require("../models/Product");
const OrderPlan = require("../models/OrderPlan");
const { toCents } = require("../utils/money");
const { emitToAdmins } = require("../socket");

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function assertTargetUser(userId, actor) {
  const user = await User.findById(userId);

  if (!user || user.status === "burned") {
    throw httpError(404, "User not found");
  }

  if (actor.role === "owner") {
    if (!user.ownerId || !user.ownerId.equals(actor._id)) {
      throw httpError(403, "Forbidden");
    }
  }

  return user;
}

async function assertPlanReadable(plan, actor) {
  if (actor.role === "admin") {
    return;
  }

  const user = await User.findById(plan.userId);

  if (
    actor.role === "owner" &&
    user &&
    user.ownerId &&
    user.ownerId.equals(actor._id)
  ) {
    return;
  }

  throw httpError(403, "Forbidden");
}

async function createPlan({ userId, totalOrders, luckyPositions }, actor) {
  const user = await assertTargetUser(userId, actor);

  const existingPlan = await OrderPlan.exists({ userId: user._id });

  if (existingPlan) {
    throw httpError(409, "User already has an order plan");
  }

  const existingTasks = await Task.exists({ userId: user._id });

  if (existingTasks) {
    throw httpError(409, "User already has tasks");
  }

  const seenNumbers = new Set();
  const productIds = [];

  for (const position of luckyPositions) {
    if (position.orderNumber > totalOrders) {
      throw httpError(400, "Lucky position must be within total order count");
    }

    if (seenNumbers.has(position.orderNumber)) {
      throw httpError(400, "Duplicate lucky position");
    }

    seenNumbers.add(position.orderNumber);

    let depositCents;
    let commissionCents;

    try {
      depositCents = toCents(position.requiredDeposit);
      commissionCents = toCents(position.luckyCommission);
    } catch {
      throw httpError(400, "Invalid lucky position amount");
    }

    if (depositCents < 0n || commissionCents < 0n) {
      throw httpError(400, "Lucky amounts must not be negative");
    }

    if (position.productId) {
      productIds.push(position.productId);
    }
  }

  if (productIds.length > 0) {
    const found = await Product.countDocuments({
      _id: { $in: productIds },
    });

    if (found !== productIds.length) {
      throw httpError(400, "One or more products not found");
    }
  }

  const plan = await OrderPlan.create({
    userId: user._id,
    totalOrders,
    luckyPositions: luckyPositions.map((position) => ({
      orderNumber: position.orderNumber,
      productId: position.productId || null,
      requiredDeposit: position.requiredDeposit,
      luckyCommission: position.luckyCommission,
    })),
  });

  emitToAdmins("order:plan_created", {
    planId: String(plan._id),
    userId: String(plan.userId),
    totalOrders: plan.totalOrders,
  });

  return plan;
}

function nextLuckyDeposit(plan) {
  const candidates = plan.luckyPositions
    .filter((position) => toCents(position.requiredDeposit.toString()) > 0n)
    .filter(
      (position) =>
        plan.status === "draft" || position.orderNumber > plan.completedCount,
    )
    .sort((a, b) => a.orderNumber - b.orderNumber);

  if (candidates.length === 0) {
    return null;
  }

  const next = candidates[0];

  return {
    orderNumber: next.orderNumber,
    requiredDeposit: String(next.requiredDeposit),
  };
}

function serializePlan(plan) {
  return {
    _id: plan._id,
    // listPlans က userId ကို populate လုပ်ထားလို့ object ဖြစ်နိုင်တာမို့
    // အမြဲ id string အဖြစ်ပြီး ပို့ပါမယ်။
    userId: String(plan.userId?._id ?? plan.userId),
    totalOrders: plan.totalOrders,
    status: plan.status,
    completedCount: plan.completedCount,
    initialDeposit: plan.initialDeposit ? String(plan.initialDeposit) : null,
    currentBase: plan.currentBase ? String(plan.currentBase) : null,
    luckyPositions: plan.luckyPositions.map((position) => ({
      orderNumber: position.orderNumber,
      productId: position.productId,
      requiredDeposit: String(position.requiredDeposit),
      luckyCommission: String(position.luckyCommission),
    })),
    nextLuckyDeposit: nextLuckyDeposit(plan),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

async function getMyPlan(userId) {
  return OrderPlan.findOne({ userId });
}

async function deletePlan(planId, actor) {
  const plan = await getPlanById(planId, actor);

  if (plan.status !== "draft") {
    throw httpError(409, "Only draft plans can be deleted");
  }

  await OrderPlan.deleteOne({ _id: plan._id });

  return plan;
}

async function getPlanById(planId, actor) {
  if (!mongoose.isValidObjectId(planId)) {
    throw httpError(400, "Invalid plan ID");
  }

  const plan = await OrderPlan.findById(planId);

  if (!plan) {
    throw httpError(404, "Plan not found");
  }

  await assertPlanReadable(plan, actor);

  return plan;
}

async function listPlans(filters) {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.userId && mongoose.isValidObjectId(filters.userId)) {
    query.userId = filters.userId;
  }

  if (filters.ownerId) {
    const ownerUserIds = await User.find({ ownerId: filters.ownerId }).distinct(
      "_id",
    );
    query.userId = { $in: ownerUserIds };
  }

  return OrderPlan.find(query)
    .populate("userId", "name phone")
    .sort({ createdAt: -1 });
}

module.exports = {
  createPlan,
  serializePlan,
  getMyPlan,
  getPlanById,
  listPlans,
  deletePlan,
  httpError,
  assertTargetUser,
  assertPlanReadable,
};
