require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const Product = require("../src/models/Product");

(async () => {
  await connectDB();

  const res = await Product.deleteMany({ code: /^(E2E|SMK)/ });
  console.log("deleted E2E products:", res.deletedCount);

  const total = await Product.countDocuments();
  console.log("products remaining:", total);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
