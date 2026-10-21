const mongoose = require("mongoose");
const Task = require("../models/Task");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const OrderPlan = require("../models/OrderPlan");
const { toCents, decimal } = require("../utils/money");
const {
  projectedBaseCents,
  commissionCents,
  priceRangeForBase,
  selectProductsForRange,
} = require("./orderSelection");
const { getPlanById, httpError } = require("./orderPlanService");
const { emitToAdmins } = require("../socket");

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

      const existingTasks = await Task.exists({
        userId: fresh.userId,
      }).session(session);

      if (existingTasks) {
        throw httpError(409, "User already has tasks");
      }

      const deposit =
        await Transaction.findById(depositTransactionId).session(session);

      if (
        !deposit ||
        deposit.type !== "deposit" ||
        deposit.status !== "accepted" ||
        !deposit.userId.equals(fresh.userId)
      ) {
        throw httpError(
          400,
          "An accepted deposit transaction for this user is required",
        );
      }

      const usedElsewhere = await OrderPlan.exists({
        initialDepositTxId: deposit._id,
        _id: { $ne: fresh._id },
      }).session(session);

      if (usedElsewhere) {
        throw httpError(409, "Deposit already used for another plan");
      }

      const depositCents = toCents(deposit.amount.toString());

      if (depositCents < 1n) {
        throw httpError(400, "Deposit amount must be positive");
      }

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

      const luckyProducts = new Map();

      for (const position of fresh.luckyPositions) {
        if (!position.productId) {
          // Admin က product မရွေးထားရင် အောက်မှာ deposit အလိုက် အလိုအလျောက် ရွေးမယ်။
          luckyProducts.set(position.orderNumber, null);
          continue;
        }

        const product = await Product.findById(position.productId).session(
          session,
        );

        if (!product) {
          throw httpError(400, "Lucky product no longer exists");
        }

        luckyProducts.set(position.orderNumber, product);
      }

      const reservedIds = fresh.luckyPositions
        .map((position) => position.productId)
        .filter(Boolean);

      const candidateDocs = await Product.find(
        reservedIds.length > 0 ? { _id: { $nin: reservedIds } } : {},
      )
        .session(session)
        .sort({ price: 1, _id: 1 });

      const pool = candidateDocs.map((doc) => ({
        id: doc._id,
        priceCents: toCents(doc.price.toString()),
        doc,
      }));

      const taskDocs = [];

      for (
        let orderNumber = 1;
        orderNumber <= fresh.totalOrders;
        orderNumber += 1
      ) {
        const base = projectedBaseCents(
          depositCents,
          basePositions,
          orderNumber,
        );
        const { lo, hi } = priceRangeForBase(base);
        const luckyPosition = luckyByNumber.get(orderNumber);

        if (luckyPosition) {
          let product = luckyProducts.get(orderNumber);
          let priceCents;

          if (!product) {
            // အလိုအလျောက် ရွေးမယ် — deposit အလိုက်ရဲ့ range ထဲက product ကို
            // (in-range အရင်, မရှိရင် အနီးဆုံး အောက်က) ယူမယ်။
            const [autoPicked] = selectProductsForRange(pool, 1, lo, hi);

            if (!autoPicked) {
              throw httpError(
                400,
                `No product available for lucky order ${orderNumber}`,
              );
            }

            product = autoPicked.doc;
            priceCents = autoPicked.priceCents;

            pool.splice(pool.indexOf(autoPicked), 1);
          } else {
            priceCents = toCents(product.price.toString());

            if (priceCents < lo || priceCents > hi) {
              throw httpError(
                400,
                `Lucky product price is outside the allowed range for order ${orderNumber}`,
              );
            }
          }

          taskDocs.push({
            userId: fresh.userId,
            orderPlanId: fresh._id,
            orderNumber,
            productName: product.name,
            productId: product._id,
            imageUrl: product.imageUrl,
            code: product.code || "",
            category: product.category || "",
            usage: product.usage || "",
            description: product.description,
            price: decimal(priceCents),
            commission: luckyPosition.luckyCommission,
            isLuckyOrder: true,
            status: "pending",
          });

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

        taskDocs.push({
          userId: fresh.userId,
          orderPlanId: fresh._id,
          orderNumber,
          productName: picked.doc.name,
          productId: picked.doc._id,
          imageUrl: picked.doc.imageUrl,
          code: picked.doc.code || "",
          category: picked.doc.category || "",
          usage: picked.doc.usage || "",
          description: picked.doc.description,
          price: decimal(picked.priceCents),
          commission: decimal(commissionCents(picked.priceCents)),
          isLuckyOrder: false,
          status: "pending",
        });
      }

      await Task.insertMany(taskDocs, { session });

      fresh.status = "generated";
      fresh.initialDeposit = decimal(depositCents);
      fresh.initialDepositTxId = deposit._id;
      fresh.currentBase = decimal(depositCents);
      await fresh.save({ session });

      generated = fresh;
    });

    emitToAdmins("order:plan_generated", {
      planId: String(generated._id),
      userId: String(generated.userId),
      totalOrders: generated.totalOrders,
    });

    return generated;
  } finally {
    await session.endSession();
  }
}

module.exports = { generateOrders };
