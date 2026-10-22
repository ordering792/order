// Legacy task status ပြောင်းခြင်း: "pending" → "available"
// (status ပြောင်းမှီး ဖန်တီးထားတဲ့ task တွေကို အသစ် schema နဲ့တူညီအောင် ပြောင်းသွားမယ်)
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const Task = require("../src/models/Task");

(async () => {
  await connectDB();

  const before = await Task.countDocuments({ status: "pending" });
  const result = await Task.updateMany(
    { status: "pending" },
    { $set: { status: "available" } },
  );

  const byStatus = await Task.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log(`migrated ${result.modifiedCount} task(s) from "pending" (${before} found)`);
  console.log("tasks by status:", JSON.stringify(byStatus));

  await mongoose.disconnect();
})().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
