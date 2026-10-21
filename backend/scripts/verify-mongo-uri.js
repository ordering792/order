require("dotenv").config();
const mongoose = require("mongoose");
const { configureDns, resolveMongoUri } = require("../src/config/dns");

configureDns();

(async () => {
  const rawUri = process.env.MONGODB_URI;
  const uri = await resolveMongoUri(rawUri);

  console.log("raw URI    :", rawUri.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@"));
  console.log("direct URI :", uri.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@").slice(0, 170));

  const started = Date.now();
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 15000,
  });

  const info = await mongoose.connection.db.admin().command({ buildInfo: 1 });
  console.log(`connected OK in ${Date.now() - started}ms - mongod ${info.version}`);

  const User = require("../src/models/User");
  const Product = require("../src/models/Product");
  const Task = require("../src/models/Task");
  const Transaction = require("../src/models/Transaction");

  console.log("db name      :", mongoose.connection.name);
  console.log("users        :", await User.countDocuments());
  console.log("products     :", await Product.countDocuments());
  console.log("tasks        :", await Task.countDocuments());
  console.log("transactions :", await Transaction.countDocuments());
  console.log("admins       :", await User.countDocuments({ role: "admin" }));
  console.log("owners       :", await User.countDocuments({ role: "owner" }));

  await mongoose.disconnect();
  console.log("RESULT: URL မှန်ကန်ပါသေးလား - connect + auth + query အားလုံး အောင်မြင်ပါပြီး");
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
