// Schema migration တွေကို သတ်မှတ်အစဉ်အတိုင်း run လုပ်ပြီး မှတ်တမ်းတင်မယ်။
//   node scripts/migrate.js           — ကျန်နေတဲ့ migration တွေကို အစဉ်လိုက် run
//   node scripts/migrate.js --status  — ဘယ်ဟာ apply ပြီး / ကျန်နေလဲ ပြမယ် (DB မပြောင်းဘူး)
//
// လက်နဲ့ တစ်ကြိမ် run ပြီးသား DB ကို runner က ခွဲမသိနိုင်လို့ script တစ်ခုချင်းစီ
// idempotent ဖြစ်အောင် ထားထားတယ် (dropIndex skip + syncIndexes / status updateMany)။
// ပထမဆုံး run မှာ အဲဒါတွေ ပြန် run ဖြစ်နိုင်ပေမယ့် ထပ်တလဲလဲ run လည်း DB မပျက်ဘူး။
require("dotenv").config();
const path = require("path");
const { spawnSync } = require("child_process");
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");

// အစဉ်က အရေးကြီး — data (status) ပြောင်းတဲ့ migration ကို index sync တွေ
// မတိုင်မီ run မယ်၊ index build က ပြောင်းပြီး data အပေါ် မူလေ့လာနိုင်လို့။
const MIGRATIONS = [
  { name: "migrate-task-status", file: "migrate-task-status.js" },
  { name: "migrate-task-index", file: "migrate-task-index.js" },
  { name: "migrate-orderplan-index", file: "migrate-orderplan-index.js" },
  { name: "migrate-product-snapshot", file: "migrate-product-snapshot.js" },
];

const REGISTRY_COLLECTION = "schemamigrations";

async function main() {
  const statusOnly = process.argv.includes("--status");

  await connectDB();

  const registry = mongoose.connection.db.collection(REGISTRY_COLLECTION);
  await registry.createIndex({ name: 1 }, { unique: true });

  const applied = new Set(
    (await registry.find({}, { projection: { name: 1 } }).toArray()).map(
      (doc) => doc.name,
    ),
  );

  if (statusOnly) {
    for (const migration of MIGRATIONS) {
      const state = applied.has(migration.name) ? "[applied]" : "[pending]";
      console.log(`${state} ${migration.name}`);
    }
    await mongoose.disconnect();
    return;
  }

  const pending = MIGRATIONS.filter((migration) => !applied.has(migration.name));

  if (pending.length === 0) {
    console.log("all migrations already applied");
    await mongoose.disconnect();
    return;
  }

  for (const migration of pending) {
    console.log(`\n=== running ${migration.name} ===`);

    const child = spawnSync(process.execPath, [path.join(__dirname, migration.file)], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });

    if (child.status !== 0) {
      console.error(
        `${migration.name} failed (exit ${child.status}) — stopping; later migrations were not attempted.`,
      );
      await mongoose.disconnect();
      process.exit(1);
    }

    await registry.insertOne({ name: migration.name, appliedAt: new Date() });
    console.log(`=== ${migration.name} recorded ===`);
  }

  await mongoose.disconnect();
  console.log(`\n${pending.length} migration(s) applied`);
}

main().catch((err) => {
  console.error("migrate runner failed:", err.message);
  process.exit(1);
});
