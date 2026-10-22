// Local in-memory MongoDB နဲ့ backend ကို run ခြင်း (test အတွက် — Atlas network မလိုတဲ့အခါမှ)
//   node scripts/start-memory-backend.js [port]
require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");

// Test environment အတွက် admin account + product catalog seed
async function seedTestData(uri) {
  const mongoose = require("mongoose");
  const bcrypt = require("bcryptjs");
  const User = require("../src/models/User");
  const Product = require("../src/models/Product");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const passwordHash = await bcrypt.hash("admin123456", 10);

  await User.create({
    name: "Admin User",
    phone: "0900000001",
    passwordHash,
    invitationCode: "ADMIN001",
    role: "admin",
  });

  await Product.insertMany(
    Array.from({ length: 500 }, (_, i) => ({
      name: `Catalog Item ${i + 1}`,
      code: `P${String(i + 1).padStart(4, "0")}`,
      category: ["Electronics", "Home & Kitchen", "Accessories", "Office", "Lifestyle"][i % 5],
      usage: "Handle with care before use.",
      description: `Quality item number ${i + 1} for daily use.`,
      imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
      price: `${(50 + i * 10).toFixed(2)}`,
    })),
  );

  await mongoose.disconnect();
  console.log("[memory-db] seeded admin + 500 products");
}

async function main() {
  const port = Number(process.argv[2] || process.env.MEMORY_BACKEND_PORT || 5000);

  process.env.MONGOMS_STORAGE_ENGINE = "wiredTiger";

  const { MongoMemoryReplSet } = require("mongodb-memory-server");
  const mongod = await MongoMemoryReplSet.create({
    replSet: {
      name: "testset",
      count: 1,
      storageEngine: "wiredTiger",
    },
    // 47117 က backend tests (globalSetup) နဲ့ conflict ဖြစ်တာမို့ နောက်နောင် port သုံးမယ်
    instanceOpts: [{ port: 47118 }],
  });

  const uri = mongod.getUri();
  console.log(`[memory-db] ${uri}`);

  await seedTestData(uri);

  const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "server.js")], {
    env: {
      ...process.env,
      MONGODB_URI: uri,
      PORT: String(port),
      CLIENT_ORIGIN:
        process.env.CLIENT_ORIGIN || "http://localhost:3000,http://localhost:3001",
    },
    stdio: "inherit",
  });

  const shutdown = async () => {
    child.kill();
    await mongod.stop().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", async () => {
    await mongod.stop().catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("memory backend failed:", err.message);
  process.exit(1);
});
