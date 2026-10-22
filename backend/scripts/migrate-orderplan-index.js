// OrderPlan ရဲ့ userId unique index ကို ဖယ်ပြီး (user တစ်ယောက်က plan အများရှိနိုင်ရန်)
//   node scripts/migrate-orderplan-index.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const OrderPlan = require("../src/models/OrderPlan");

(async () => {
  await connectDB();

  const indexes = await OrderPlan.collection.indexes();
  console.log("before:", JSON.stringify(indexes.map((i) => i.key)));

  // unique index ကို ဖယ်ပြီး normal index ပြန်ဖန်တင်မယ်
  await OrderPlan.collection.dropIndex("userId_1").catch((err) => {
    console.log("dropIndex skipped:", err.message);
  });

  await OrderPlan.syncIndexes();

  console.log("after :", JSON.stringify((await OrderPlan.collection.indexes()).map((i) => i.key)));

  await mongoose.disconnect();
  console.log("migration done");
})().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
