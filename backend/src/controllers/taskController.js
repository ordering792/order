const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { completeTask } = require("../services/taskCompletionService");
const { getMyPlan } = require("../services/orderPlanService");

// Admin က round အသစ် ထပ်ဖွင့်တာနဲ့ user screen မှာ အရင် round ရဲ့
// completed order တွေ မပြတော့ရ — row တွေက DB ထဲမှာ အမြဲ ကျန်တယ်။
exports.myTasks = asyncHandler(async (req, res) => {
  const plan = await getMyPlan(req.user._id);

  const tasks = await Task.find({
    userId: req.user._id,
    ...(plan ? { orderPlanId: plan._id } : {}),
  })
    .sort({ orderNumber: 1 })
    .lean();

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
  })
    .sort({ orderNumber: 1 })
    .lean();

  res.json({ tasks });
});

// Legacy task creation (plan-less 40 tasks) was removed — order generation
// happens only through the plan flow (POST /api/orders/plans/:id/generate).
// Existing plan-less tasks created before this change still work in the
// grab flow (getUserPlan falls back to planless scope).

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
