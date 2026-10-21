require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const User = require("../src/models/User");
const Task = require("../src/models/Task");
const Transaction = require("../src/models/Transaction");
const OrderPlan = require("../src/models/OrderPlan");

const TEST_NAMES = [
  "FlowUser",
  "DbgUser",
  "TaskDbg",
  "PlanDbg",
  "ShowUser",
  "DepUser",
  "OwnerDepUser",
  "OwnerWallet",
  "WalletOwner",
  "AutoLucky",
  "ReproChk",
  "TokenChk",
  "RefactorFlow",
  "SecFlow",
];

(async () => {
  await connectDB();

  const users = await User.find({ name: { $in: TEST_NAMES } });
  const ids = users.map((u) => u._id);

  const tasks = await Task.deleteMany({ userId: { $in: ids } });
  const txs = await Transaction.deleteMany({ userId: { $in: ids } });
  const plans = await OrderPlan.deleteMany({ userId: { $in: ids } });
  const removed = await User.deleteMany({ _id: { $in: ids } });

  // Admin ရဲ့ payout address ကို ဖျက်ဖို့ အတည်ပြုချက် လိုတယ် — production DB မှာ အမှားဖျက်မို့။
  if (process.env.RESET_ADMIN_WALLET === "1") {
    const admins = await User.updateMany(
      { role: "admin" },
      { $set: { cryptoAddress: null, cryptoQrUrl: null } },
    );
    console.log("admin payout wallets reset:", admins.modifiedCount);
  }

  console.log(
    `cleaned users=${removed.deletedCount} tasks=${tasks.deletedCount} tx=${txs.deletedCount} plans=${plans.deletedCount}`,
  );
  console.log("users remaining:", await User.countDocuments());

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
