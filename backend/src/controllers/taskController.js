const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
const { toCents, decimal } = require("../utils/money");
const asyncHandler = require("../utils/asyncHandler");
const { completeTask } = require("../services/taskCompletionService");

exports.myTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({
    userId: req.user._id,
  }).sort({ orderNumber: 1 });

  res.json({ tasks });
});

// Admin / Owner က user တစ်ယောက်ရဲ့ task တွေကို စစ်ဆေးပြီး complete ခေါ်နိုင်ရမယ်။
exports.userTasks = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (
    req.user.role === "owner" &&
    (!user.ownerId || !user.ownerId.equals(req.user._id))
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const tasks = await Task.find({
    userId,
    ...(req.query.planId && mongoose.isValidObjectId(req.query.planId)
      ? { orderPlanId: req.query.planId }
      : {}),
  }).sort({ orderNumber: 1 });

  res.json({ tasks });
});

exports.generate = asyncHandler(async (req, res) => {
  const { userId, tasks } = req.body;

  if (
    !mongoose.isValidObjectId(userId) ||
    !Array.isArray(tasks) ||
    tasks.length !== 40
  ) {
    return res.status(400).json({
      message: "Provide a userId and exactly 40 tasks",
    });
  }

  const userExists = await User.exists({
    _id: userId,
    status: { $ne: "burned" },
  });

  if (!userExists) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const numbers = new Set();

  for (const task of tasks) {
    if (
      !Number.isInteger(task.orderNumber) ||
      task.orderNumber < 1 ||
      task.orderNumber > 40 ||
      numbers.has(task.orderNumber) ||
      typeof task.productName !== "string" ||
      !task.productName.trim() ||
      typeof task.isLuckyOrder !== "boolean"
    ) {
      return res.status(400).json({
        message: "Invalid task data",
      });
    }

    numbers.add(task.orderNumber);

    try {
      const price = toCents(task.price);
      const commission = toCents(task.commission);

      if (price <= 0n || commission < 0n) {
        throw new Error("Invalid amount");
      }
    } catch {
      return res.status(400).json({
        message: "Invalid task price or commission",
      });
    }
  }

  if (numbers.size !== 40) {
    return res.status(400).json({
      message: "Order numbers 1 to 40 are required",
    });
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const existing = await Task.countDocuments({
        userId,
      }).session(session);

      if (existing > 0) {
        const err = new Error("Tasks already exist for this user");
        err.status = 409;
        throw err;
      }

      await Task.insertMany(
        tasks.map((task) => ({
          userId,
          orderNumber: task.orderNumber,
          productName: task.productName.trim(),
          code: typeof task.code === "string" ? task.code.trim() : "",
          category: typeof task.category === "string" ? task.category.trim() : "",
          usage: typeof task.usage === "string" ? task.usage.trim() : "",
          price: decimal(toCents(task.price)),
          commission: decimal(toCents(task.commission)),
          isLuckyOrder: task.isLuckyOrder,
          status: "available",
        })),
        { session },
      );
    });

    res.status(201).json({
      message: "40 tasks created successfully",
    });
  } finally {
    await session.endSession();
  }
});

// Admin / Owner / User ကိုယ်တိုင် Task Complete (permission က service ထဲ စစ်)။
exports.complete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      message: "Invalid task ID",
    });
  }

  const result = await completeTask(id, req.user);

  res.json({ message: "Task completed", task: result.task });
});
