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
const { getPlanById } = require("./orderPlanService");
const { httpError } = require("../utils/httpError");
const { isDuplicateKeyError } = require("../utils/duplicateKey");
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

      // createPlan ရဲ့ check နဲ့ တစ်ထပ်တည်း — plan မရှိတဲ့ (legacy) task ကိုပဲ ပိတ်တယ်။
      // ရပြီးတဲ့ plan ရဲ့ task တွေက orderPlanId ရှိလို့ round ၂ generate ကို မတားဘူး။
      const existingTasks = await Task.exists({
        userId: fresh.userId,
        orderPlanId: null,
      }).session(session);

      if (existingTasks) {
        throw httpError(409, "User already has tasks");
      }

      // Base နှစ်မျိုး — depositTransactionId ပေးရင် deposit အပေါ် တွက်မယ် (round ၁ /
      // lucky ပါတဲ့ plan)။ မပေးရင် အရင် deposit လုပ်ဖူးပြီး lucky မပါတဲ့ plan အတွက်
      // user ရဲ့ လက်ရှိ balance ကို base ထားမယ် — deposit အသစ် မလိုဘူး။
      let baseCents;
      let depositTx = null;

      if (depositTransactionId) {
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

        depositTx = deposit;
        baseCents = depositCents;
      } else {
        // Lucky order ပါလဲ balance base နဲ့ လုပ်လို့ရတယ် — lucky order ရောက်တဲ့အခါ
        // completion မှာ requiredDeposit အတိအကျနဲ့တူတဲ့ deposit transaction ကို
        // claim လုပ်တာက အတိုင်းအတာ ထားမယ် (taskCompletionService)။
        const hasDeposited = await Transaction.exists({
          userId: fresh.userId,
          type: "deposit",
          status: "accepted",
        }).session(session);

        if (!hasDeposited) {
          throw httpError(
            400,
            "User must complete a first deposit before balance-based orders",
          );
        }

        const user = await User.findById(fresh.userId).session(session);

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

        baseCents = balanceCents;
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

      const taskDocs = [];

      for (
        let orderNumber = 1;
        orderNumber <= fresh.totalOrders;
        orderNumber += 1
      ) {
        const base = projectedBaseCents(
          baseCents,
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
            status: "available",
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
          status: "available",
        });
      }

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

module.exports = { generateOrders };
