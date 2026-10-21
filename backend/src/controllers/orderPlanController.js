const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const orderPlanService = require("../services/orderPlanService");
const { generateOrders } = require("../services/orderGenerationService");

const createPlanSchema = z.object({
  userId: z.string().length(24),
  totalOrders: z.number().int().min(1).max(500),
  luckyPositions: z
    .array(
      z.object({
        orderNumber: z.number().int().min(1),
        // productId မထည့်ရင် backend က အလိုအလျောက် product ရွေးပေးမယ်။
        productId: z.string().length(24).nullish(),
        requiredDeposit: z.string().default("0.00"),
        luckyCommission: z.string(),
      }),
    )
    .optional()
    .default([]),
});

const generateSchema = z.object({
  depositTransactionId: z.string().length(24),
});

async function handleError(res, err) {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }

  return res
    .status(500)
    .json({ message: err.message || "Internal server error" });
}

exports.createPlan = asyncHandler(async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  try {
    const plan = await orderPlanService.createPlan(parsed.data, req.user);

    res.status(201).json({
      message: "Order plan created",
      plan: orderPlanService.serializePlan(plan),
    });
  } catch (err) {
    await handleError(res, err);
  }
});

exports.myPlan = asyncHandler(async (req, res) => {
  const plan = await orderPlanService.getMyPlan(req.user._id);

  if (!plan) {
    return res.status(404).json({ message: "No order plan found" });
  }

  res.json({ plan: orderPlanService.serializePlan(plan) });
});

exports.getPlan = asyncHandler(async (req, res) => {
  try {
    const plan = await orderPlanService.getPlanById(req.params.id, req.user);

    res.json({ plan: orderPlanService.serializePlan(plan) });
  } catch (err) {
    await handleError(res, err);
  }
});

exports.adminList = asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    userId: req.query.userId,
  };

  // Owner က ကိုယ့် downline user တွေရဲ့ plan တွေကိုသာ မြင်ရမယ်။
  if (req.user.role === "owner") {
    filters.ownerId = req.user._id;
  }

  const plans = await orderPlanService.listPlans(filters);

  res.json({
    plans: plans.map((plan) => ({
      ...orderPlanService.serializePlan(plan),
      user: plan.userId
        ? {
            _id: plan.userId._id,
            name: plan.userId.name,
            phone: plan.userId.phone,
          }
        : null,
    })),
  });
});

exports.generate = asyncHandler(async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  try {
    const plan = await generateOrders(
      { planId: req.params.id, ...parsed.data },
      req.user,
    );

    res.status(201).json({
      message: `${plan.totalOrders} orders generated`,
      plan: orderPlanService.serializePlan(plan),
    });
  } catch (err) {
    await handleError(res, err);
  }
});

exports.deletePlan = asyncHandler(async (req, res) => {
  try {
    await orderPlanService.deletePlan(req.params.id, req.user);

    res.json({ message: "Plan deleted" });
  } catch (err) {
    await handleError(res, err);
  }
});
