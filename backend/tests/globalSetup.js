const mongoose = require("mongoose");
const fs = require("fs");

// Atlas URI က code ထဲမှာ မရှိစေဘူး — env (TEST_MONGODB_URI / MONGODB_URI) ကနေသာ ယူမယ်။
const ATLAS_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;

const LOCAL_BINARY = String.raw`C:\Users\Lenovo\.cache\mongodb-binaries\mongod-x64-win32-7.0.24.exe`;

function wantsDatabase() {
  const args = process.argv.join(" ");
  if (/\bunit\b/.test(args) && !/integration/.test(args)) {
    return false;
  }
  return true;
}

module.exports = async () => {
  process.env.MONGODB_URI = ATLAS_URI;
  process.env.JWT_SECRET = "test-secret";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.CLIENT_ORIGIN = "http://localhost:3000";

  // mongodb driver 7.x uses dynamic import() for runtime adapters.
  // Jest's VM context requires --experimental-vm-modules for that to work;
  // without it, client metadata becomes {} and mongod rejects the handshake.
  const flag = "--experimental-vm-modules";
  const existing = process.env.NODE_OPTIONS || "";
  if (!existing.includes(flag)) {
    process.env.NODE_OPTIONS = existing ? `${existing} ${flag}` : flag;
  }

  if (!wantsDatabase()) {
    return;
  }

  // Local memory server is the deterministic default. Atlas is opt-in
  // (TEST_USE_ATLAS=1) because this network's Atlas connectivity is flaky —
  // a successful connect that later stalls makes every test fail.
  const useAtlas = process.env.TEST_USE_ATLAS === "1";

  if (useAtlas) {
    if (!ATLAS_URI) {
      throw new Error(
        "TEST_USE_ATLAS=1 requires TEST_MONGODB_URI (or MONGODB_URI) to be set",
      );
    }

    try {
      await mongoose.connect(ATLAS_URI, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
      });

      // Verify actual data-plane round-trip, not just the handshake.
      const health = mongoose.connection.db.collection("__test_health");
      await health.insertOne({ t: Date.now() });
      await health.deleteMany({});
      await mongoose.disconnect();

      process.env.MONGO_TEST_SOURCE = "atlas";
      return;
    } catch (err) {
      process.stderr.write(
        `[globalSetup] Atlas unusable (${err.code || err.message}); falling back to mongodb-memory-server\n`,
      );
      try {
        await mongoose.disconnect();
      } catch {
        // already disconnected
      }
    }
  }

  if (fs.existsSync(LOCAL_BINARY)) {
    process.env.MONGOMS_SYSTEM_BINARY = LOCAL_BINARY;
  }
  process.env.MONGOMS_STORAGE_ENGINE = "wiredTiger";

  const { MongoMemoryReplSet } = require("mongodb-memory-server");
  const mongod = await MongoMemoryReplSet.create({
    replSet: {
      name: "testset",
      count: 1,
      storageEngine: "wiredTiger",
    },
    // Windows က reserved port range တွေ (Hyper-V/WSL) ထဲမှာ random port ကို
    // မသုံးဘဲ သတ်မသန့် port ကို သုံးမယ် (EACCES ကြောင့် test မှားနေရင်)။
    instanceOpts: [{ port: Number(process.env.MONGOMS_TEST_PORT) || 47117 }],
  });
  global.__MONGOD__ = mongod;
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGO_TEST_SOURCE = "memory-server";
};
