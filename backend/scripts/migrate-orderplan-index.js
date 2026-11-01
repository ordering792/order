// OrderPlan ရဲ့ userId unique index ကို ဖျက်ပြီး (user တစ်ယောက်မှာ plan အများရှိနိုင်အောင်)
// active-plan-only partial unique index ကို sync လုပ်တယ် (race ကြောင့် active plan
// နှစ်ခု ထွက်လာမှုကို DB level ကနေ ပိတ်ဖို့)။
//   node scripts/migrate-orderplan-index.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const OrderPlan = require("../src/models/OrderPlan");
const { currentIndexes } = require("./lib/schemaIndexes");

(async () => {
  await connectDB();

  const indexes = await currentIndexes(OrderPlan);
  console.log("before:", JSON.stringify(indexes.map((i) => i.key)));

  // unique index ကို ဖျက်ပြီး normal index အဖြစ် ပြောင်းမယ်
  await OrderPlan.collection.dropIndex("userId_1").catch((err) => {
    console.log("dropIndex skipped:", err.message);
  });

  // Partial unique index က "user တစ်ယောက် active plan တစ်ခုပဲ" ဆိုတဲ့
  // invariant ကို ပြတ်စေမယ့် ရှိပြီးသား data ပေါ်မှာ build မလုပ်နိုင်ဘူး။
  // အဲဒီလို user ရှိရင် ဘယ် plan က မှန်တဲ့ active plan လဲ မသိနိုင်လို့
  // အလိုအလျောက် မပြင်ဘူး — admin က ကိုယ်တိုင် ဆုံးဖြတ်ရမယ်။
  const duplicates = await OrderPlan.aggregate([
    { $match: { status: { $in: ["draft", "generated"] } } },
    { $group: { _id: "$userId", count: { $sum: 1 }, plans: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicates.length > 0) {
    console.error(
      "Found users with more than one active order plan — resolve these before syncing the unique index:",
    );
    for (const dup of duplicates) {
      console.error(
        `  user ${String(dup._id)}: ${dup.count} active plans (${dup.plans.join(", ")})`,
      );
    }
    console.error(
      "Keep one active plan per user (complete or delete the extras), then re-run this script.",
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  await OrderPlan.syncIndexes();

  console.log(
    "after :",
    JSON.stringify((await OrderPlan.collection.indexes()).map((i) => i.key)),
  );

  await mongoose.disconnect();
  console.log("migration done");
})().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
