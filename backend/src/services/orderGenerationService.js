const mongoose = require("mongoose");
const Task = require("../models/Task");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const OrderPlan = require("../models/OrderPlan");
const User = require("../models/User");
const { toCents, decimal } = require("../utils/money");
const {
  projectedBaseCents,
  commissionCents,
  priceRangeForBase,
  selectProductsForRange,
} = require("./orderSelection");
const { getPlanById, normalizeLuckyPositions } = require("./orderPlanService");
const { httpError } = require("../utils/httpError");
const { isDuplicateKeyError } = require("../utils/duplicateKey");
const { emitToAdmins } = require("../socket");

// Round base ကို ဆုံးဖြတ်တယ်။ depositTransactionId ပေးရင် deposit အပေါ်
// တွက်မယ် (round ၁ / သီးသန့် deposit ပါတဲ့ plan)၊ မပေးရင် user ရဲ့ လက်ရှိ
// balance ကို base ထားမယ် — deposit အသစ် မလိုဘူး။
async function resolveBaseCents(plan, depositTransactionId, session) {
  if (!depositTransactionId) {
    return { baseCents: await balanceBaseCents(plan, session), depositTx: null };
  }

  const deposit =
    await Transaction.findById(depositTransactionId).session(session);

  if (
    !deposit ||
    deposit.type !== "deposit" ||
    deposit.status !== "accepted" ||
    !deposit.userId.equals(plan.userId)
  ) {
    throw httpError(
      400,
      "An accepted deposit transaction for this user is required",
    );
  }

  const usedElsewhere = await OrderPlan.exists({
    initialDepositTxId: deposit._id,
    _id: { $ne: plan._id },
  }).session(session);

  if (usedElsewhere) {
    throw httpError(409, "Deposit already used for another plan");
  }

  const depositCents = toCents(deposit.amount.toString());

  if (depositCents < 1n) {
    throw httpError(400, "Deposit amount must be positive");
  }

  return { baseCents: depositCents, depositTx: deposit };
}

async function balanceBaseCents(plan, session) {
  // Lucky order ပါလဲ balance base နဲ့ လုပ်လို့ရတယ် — lucky order ရောက်တဲ့အခါ
  // completion မှာ accepted deposit တွေပေါင်းလဒ် (ခွဲသွင်းထားတာပါ) ကို
  // claim လုပ်တာက အတိုင်းအတာ ထားမယ် (luckyDepositService)။
  const hasDeposited = await Transaction.exists({
    userId: plan.userId,
    type: "deposit",
    status: "accepted",
  }).session(session);

  if (!hasDeposited) {
    throw httpError(
      400,
      "User must complete a first deposit before balance-based orders",
    );
  }

  const user = await User.findById(plan.userId).session(session);

  if (!user) {
    throw httpError(409, "User unavailable");
  }

  const balanceCents = toCents(user.balance.toString());

  if (balanceCents < 1n) {
    throw httpError(
      400,
      "User balance is empty — an accepted deposit is required",
    );
  }

  return balanceCents;
}

async function loadLuckyProducts(plan, session) {
  const luckyProducts = new Map();

  for (const position of plan.luckyPositions) {
    if (!position.productId) {
      // Admin က product မရွေးထားရင် အောက်မှာ deposit အလိုက် အလိုအလျောက် ရွေးမယ်။
      luckyProducts.set(position.orderNumber, null);
      continue;
    }

    const product = await Product.findById(position.productId).session(session);

    if (!product) {
      throw httpError(400, "Lucky product no longer exists");
    }

    luckyProducts.set(position.orderNumber, product);
  }

  return luckyProducts;
}

async function loadProductPool(plan, session, extraExcludedIds = []) {
  const reservedIds = [
    ...plan.luckyPositions.map((position) => position.productId).filter(Boolean),
    ...extraExcludedIds,
  ];

  const candidateDocs = await Product.find(
    reservedIds.length > 0 ? { _id: { $nin: reservedIds } } : {},
  )
    .session(session)
    .sort({ price: 1, _id: 1 });

  const pool = [];

  for (const doc of candidateDocs) {
    try {
      pool.push({
        id: doc._id,
        priceCents: toCents(doc.price.toString()),
        doc,
      });
    } catch {
      // price မရှိတဲ့/မှားတဲ့ product ကို ချန်တယ် — ဒါကြောင့် catalog ထဲက
      // အလိုးလိုးတစ်ခုကပဲ မှားနေရင် generate အားလုံး 500 မဖြစ်ဘူး။
    }
  }

  return pool;
}

function taskDocFor({ plan, orderNumber, product, priceCents, commission, isLuckyOrder }) {
  return {
    userId: plan.userId,
    orderPlanId: plan._id,
    orderNumber,
    productName: product.name,
    productId: product._id,
    imageUrl: product.imageUrl,
    code: product.code || "",
    category: product.category || "",
    usage: product.usage || "",
    description: product.description,
    price: decimal(priceCents),
    commission,
    isLuckyOrder,
    status: "available",
  };
}

function takeLuckyProduct({ orderNumber, luckyProducts, pool, lo, hi }) {
  const product = luckyProducts.get(orderNumber);

  if (!product) {
    // အလိုအလျောက် ရွေးမယ် — deposit အလိုက်ရဲ့ range ထဲက product ကို
    // (in-range အရင်, မရှိရင် အနီးဆုံး အောက်က) ယူမယ်။
    const [autoPicked] = selectProductsForRange(pool, 1, lo, hi);

    if (!autoPicked) {
      throw httpError(400, `No product available for lucky order ${orderNumber}`);
    }

    pool.splice(pool.indexOf(autoPicked), 1);

    return { doc: autoPicked.doc, priceCents: autoPicked.priceCents };
  }

  let priceCents;

  try {
    priceCents = toCents(product.price.toString());
  } catch {
    throw httpError(400, "Lucky product has an invalid price");
  }

  if (priceCents < lo || priceCents > hi) {
    throw httpError(
      400,
      `Lucky product price is outside the allowed range for order ${orderNumber}`,
    );
  }

  return { doc: product, priceCents };
}

function buildTaskDocs({
  plan,
  baseCents,
  basePositions,
  luckyByNumber,
  luckyProducts,
  pool,
}) {
  const taskDocs = [];

  for (let orderNumber = 1; orderNumber <= plan.totalOrders; orderNumber += 1) {
    const base = projectedBaseCents(baseCents, basePositions, orderNumber);
    const { lo, hi } = priceRangeForBase(base);
    const luckyPosition = luckyByNumber.get(orderNumber);

    if (luckyPosition) {
      const { doc, priceCents } = takeLuckyProduct({
        orderNumber,
        luckyProducts,
        pool,
        lo,
        hi,
      });

      taskDocs.push(
        taskDocFor({
          plan,
          orderNumber,
          product: doc,
          priceCents,
          commission: luckyPosition.luckyCommission,
          isLuckyOrder: true,
        }),
      );

      continue;
    }

    const [picked] = selectProductsForRange(pool, 1, lo, hi);

    if (!picked) {
      throw httpError(
        400,
        "Not enough products available for the required price range",
      );
    }

    pool.splice(pool.indexOf(picked), 1);

    taskDocs.push(
      taskDocFor({
        plan,
        orderNumber,
        product: picked.doc,
        priceCents: picked.priceCents,
        commission: decimal(commissionCents(picked.priceCents)),
        isLuckyOrder: false,
      }),
    );
  }

  return taskDocs;
}

// Plan တစ်ခုကနေ order အားလုံးကို ဖန်တီးပြီး task အဖြစ် သိမ်းတယ်။
// လုပ်ဆောင်ချိန် အားလုံး transaction အတွင်း — တစ်ခုခု fail ဖြစ်ရင် rollback ဖြစ်မယ်။
async function generateOrders({ planId, depositTransactionId }, actor) {
  await getPlanById(planId, actor);

  const session = await mongoose.startSession();

  try {
    let generated;

    await session.withTransaction(async () => {
      const fresh = await OrderPlan.findById(planId).session(session);

      if (fresh.status !== "draft") {
        throw httpError(409, "Plan already generated");
      }

      // createPlan ရဲ့ check နဲ့ တစ်ထပ်တည်း — plan မရှိတဲ့ (legacy) task ကိုပဲ ပိတ်တယ်။
      // ရပြီးတဲ့ plan ရဲ့ task တွေက orderPlanId ရှိလို့ round ၂ generate ကို မတားဘူး။
      const existingTasks = await Task.exists({
        userId: fresh.userId,
        orderPlanId: null,
      }).session(session);

      if (existingTasks) {
        throw httpError(409, "User already has tasks");
      }

      const { baseCents, depositTx } = await resolveBaseCents(
        fresh,
        depositTransactionId,
        session,
      );

      const luckyByNumber = new Map(
        fresh.luckyPositions.map((position) => [
          position.orderNumber,
          position,
        ]),
      );

      const basePositions = fresh.luckyPositions.map((position) => ({
        orderNumber: position.orderNumber,
        requiredDepositCents: toCents(position.requiredDeposit.toString()),
      }));

      const taskDocs = buildTaskDocs({
        plan: fresh,
        baseCents,
        basePositions,
        luckyByNumber,
        luckyProducts: await loadLuckyProducts(fresh, session),
        pool: await loadProductPool(fresh, session),
      });

      await Task.insertMany(taskDocs, { session });

      fresh.status = "generated";
      // Balance round မှာ deposit မရှိလို့ initialDeposit/initialDepositTxId က null
      // အတိုင်း ထားမယ် — round base က currentBase မှာ မှတ်တမ်းတင်တယ်။
      fresh.initialDeposit = depositTx ? decimal(baseCents) : null;
      fresh.initialDepositTxId = depositTx ? depositTx._id : null;
      fresh.currentBase = decimal(baseCents);
      await fresh.save({ session });

      generated = fresh;
    });

    emitToAdmins("order:plan_generated", {
      planId: String(generated._id),
      userId: String(generated.userId),
      totalOrders: generated.totalOrders,
    });

    return generated;
  } catch (err) {
    // Round ၂ ကို မထည့်ခင် database က task ရဲ့ အဟောင်း (userId, orderNumber) unique
    // index ကို ဆက်လက်မက်ရှိတာမို့ order number တွေ ပြန်တူထည့်ရင် E11000 ဖြစ်တယ်။
    if (isDuplicateKeyError(err)) {
      throw httpError(
        409,
        "This database still has the legacy unique index on tasks — run scripts/migrate-task-index.js once",
      );
    }

    throw err;
  } finally {
    await session.endSession();
  }
}

// Round အတွင်းမှာ lucky tag အသစ် ထပ်ထည့်တယ် — user order စမ်းနေစဉ် card ပေါ်က။
// မစမ်းသေးတဲ့ (status available) order ခုပဲ၊ ဆုံးဖြတ်ချက် (a) အရ ဒီ order တစ်ခုကိုပဲ
// ပြောင်းတယ်။ ကျန် order တွေ price band ကို ပြန်မစီဘူး (cascade မလုပ်)။
async function addLuckyPosition(
  { planId, orderNumber, productId, requiredDeposit, luckyCommission },
  actor,
) {
  await getPlanById(planId, actor);

  const session = await mongoose.startSession();

  try {
    let updated;

    await session.withTransaction(async () => {
      const fresh = await OrderPlan.findById(planId).session(session);

      if (!fresh) {
        throw httpError(404, "Plan not found");
      }

      if (fresh.status !== "generated") {
        throw httpError(
          409,
          "Lucky positions can only be added to a generated plan",
        );
      }

      if (!fresh.currentBase) {
        throw httpError(409, "Plan has no generation base recorded");
      }

      const [position] = await normalizeLuckyPositions(
        [{ orderNumber, productId, requiredDeposit, luckyCommission }],
        fresh.totalOrders,
      );

      if (
        fresh.luckyPositions.some(
          (existing) => existing.orderNumber === orderNumber,
        )
      ) {
        throw httpError(400, "Duplicate lucky position");
      }

      const task = await Task.findOne({
        userId: fresh.userId,
        orderPlanId: fresh._id,
        orderNumber,
      }).session(session);

      if (!task) {
        throw httpError(404, `Order ${orderNumber} not found`);
      }

      if (task.status !== "available") {
        throw httpError(409, `Order ${orderNumber} is already in progress`);
      }

      // အခု order မတင် lucky deposit တွေ base ထဲ ပါတဲ့ generation formula အတိုင်း —
      // အထက် order တွေ အတွက် base က မပြောင်းဘူး (option a)။
      const baseCents = projectedBaseCents(
        toCents(fresh.currentBase.toString()),
        fresh.luckyPositions.map((existing) => ({
          orderNumber: existing.orderNumber,
          requiredDepositCents: toCents(existing.requiredDeposit.toString()),
        })),
        orderNumber,
      );

      const { lo, hi } = priceRangeForBase(baseCents);

      const usedIds = (
        await Task.distinct("productId", {
          orderPlanId: fresh._id,
          _id: { $ne: task._id },
        }).session(session)
      ).filter(Boolean);

      let chosen;
      let priceCents;

      if (position.productId) {
        const product = await Product.findById(position.productId).session(
          session,
        );

        if (!product) {
          throw httpError(400, "Lucky product no longer exists");
        }

        if (usedIds.some((id) => id.equals(product._id))) {
          throw httpError(409, "That product is already used in this round");
        }

        try {
          priceCents = toCents(product.price.toString());
        } catch {
          throw httpError(400, "Lucky product has an invalid price");
        }

        if (priceCents < lo || priceCents > hi) {
          throw httpError(
            400,
            `Lucky product price is outside the allowed range for order ${orderNumber}`,
          );
        }

        chosen = product;
      } else {
        const [autoPicked] = selectProductsForRange(
          await loadProductPool(fresh, session, usedIds),
          1,
          lo,
          hi,
        );

        if (!autoPicked) {
          throw httpError(
            400,
            `No product available for lucky order ${orderNumber}`,
          );
        }

        chosen = autoPicked.doc;
        priceCents = autoPicked.priceCents;
      }

      task.productName = chosen.name;
      task.productId = chosen._id;
      task.imageUrl = chosen.imageUrl;
      task.code = chosen.code || "";
      task.category = chosen.category || "";
      task.usage = chosen.usage || "";
      task.description = chosen.description;
      task.price = decimal(priceCents);
      task.commission = decimal(toCents(position.luckyCommission));
      task.isLuckyOrder = true;

      await task.save({ session });

      fresh.luckyPositions.push(position);
      await fresh.save({ session });

      updated = fresh;
    });

    emitToAdmins("order:lucky_added", {
      planId: String(updated._id),
      userId: String(updated.userId),
      orderNumber,
    });

    return updated;
  } finally {
    await session.endSession();
  }
}

module.exports = { generateOrders, addLuckyPosition };
