// Task ရဲ့ (userId, orderNumber) unique index ကို (userId, orderPlanId, orderNumber)
// အဖြစ် ပြောင်းတယ် — user တစ်ယောက် plan အသစ် (round ၂) စလို့ ရအောင်။
// မပြောင်းဘူးဆိုရင် round ၂ generate က E11000 duplicate key နဲ့ 500 ပြန်မယ်။
//   node scripts/migrate-task-index.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const Task = require("../src/models/Task");

(async () => {
  await connectDB();

  const indexes = await Task.collection.indexes();
  console.log("before:", JSON.stringify(indexes.map((i) => i.key)));

  await Task.collection.dropIndex("userId_1_orderNumber_1").catch((err) => {
    console.log("dropIndex skipped:", err.message);
  });

  await Task.syncIndexes();

  console.log(
    "after :",
    JSON.stringify((await Task.collection.indexes()).map((i) => i.key)),
  );

  await mongoose.disconnect();
  console.log("migration done");
})().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
