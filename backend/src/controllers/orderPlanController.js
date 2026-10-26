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
  // Balance round အတွက် မပါလဲ ရမယ် — ပါရင် deposit round အဖြစ် တွက်မယ်။
  depositTransactionId: z.string().length(24).optional(),
});

// Error handling ကို asyncHandler + app.js global handler က ထားတယ်။
// ဒီမှာ catch လုပ်ပြီး err.message ကို 500 နဲ့ ပို့ရင် internal (Mongo)
// message တွေ client ဆီ ထွက်သွားမယ်။

exports.createPlan = asyncHandler(async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const plan = await orderPlanService.createPlan(parsed.data, req.user);

  res.status(201).json({
    message: "Order plan created",
    plan: orderPlanService.serializePlan(plan),
  });
});

exports.myPlan = asyncHandler(async (req, res) => {
  const plan = await orderPlanService.getMyPlan(req.user._id);

  if (!plan) {
    return res.status(404).json({ message: "No order plan found" });
  }

  res.json({ plan: orderPlanService.serializePlan(plan) });
});

exports.getPlan = asyncHandler(async (req, res) => {
  const plan = await orderPlanService.getPlanById(req.params.id, req.user);

  res.json({ plan: orderPlanService.serializePlan(plan) });
});

exports.adminList = asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    userId: req.query.userId,
    page: req.query.page,
    limit: req.query.limit,
  };

  // Owner က ကိုယ့် downline user တွေရဲ့ plan တွေကိုသာ မြင်ရမယ်။
  if (req.user.role === "owner") {
    filters.ownerId = req.user._id;
  }

  const result = await orderPlanService.listPlans(filters);

  res.json({
    plans: result.plans.map((plan) => ({
      ...orderPlanService.serializePlan(plan),
      user: plan.userId
        ? {
            _id: plan.userId._id,
            name: plan.userId.name,
            phone: plan.userId.phone,
          }
        : null,
    })),
    total: result.total,
    page: result.page,
    pages: result.pages,
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

  const plan = await generateOrders(
    { planId: req.params.id, ...parsed.data },
    req.user,
  );

  res.status(201).json({
    message: `${plan.totalOrders} orders generated`,
    plan: orderPlanService.serializePlan(plan),
  });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  await orderPlanService.deletePlan(req.params.id, req.user);

  res.json({ message: "Plan deleted" });
});
