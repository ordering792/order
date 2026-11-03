// Task တွေက product စာသားကို generate လုပ်တဲ့အချိန် snapshot အဖြစ် ကူးထားတယ်၊
// ဒါကြောင့် admin က catalog ကို ပြင်ပြီးရင် လက်ကျန် order တွေမှာ အဟောင်းစာသားကပဲ
// ကျန်နေတယ်။ ဒီ script က completed မဟုတ်တဲ့ task တွေရဲ့ snapshot ကို လက်ရှိ
// Product နဲ့ ပြန်ကိုက်စေတယ် — price/commission ကို မထိဘူး၊ completed task က
// ငွေရှင်းပြီးတဲ့ မှတ်တမ်းဖြစ်လို့ ဘယ်တော့မှ ပြန်မရေးဘူး။
//
//   node scripts/migrate-product-snapshot.js          — report သက်သက် (DB မပြောင်းဘူး)
//   node scripts/migrate-product-snapshot.js --apply  — sync လုပ်မယ်
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const Product = require("../src/models/Product");
const Task = require("../src/models/Task");
const { CATALOG_LIMITS } = require("../src/constants/catalogLimits");

// caps တင်မတင်ခင် စာသားတွေ သိမ်းထားနိုင်ခဲ့လား စစ်ဖို့ အဟောင်းဂဏန်း။
const LEGACY_LIMITS = { name: 200, code: 50, category: 100 };

const CURRENT_LIMITS = {
  name: CATALOG_LIMITS.NAME,
  code: CATALOG_LIMITS.CODE,
  category: CATALOG_LIMITS.CATEGORY,
  usage: CATALOG_LIMITS.USAGE,
  description: CATALOG_LIMITS.DESCRIPTION,
  imageUrl: CATALOG_LIMITS.IMAGE_URL,
};

const SNAPSHOT_FIELDS = ["productName", "imageUrl", "code", "category", "usage", "description"];

function snapshotFrom(product) {
  return {
    productName: product.name,
    imageUrl: product.imageUrl ?? null,
    code: product.code || "",
    category: product.category || "",
    usage: product.usage || "",
    description: product.description || "",
  };
}

function differs(task, snapshot) {
  return SNAPSHOT_FIELDS.some((field) => (task[field] ?? null) !== (snapshot[field] ?? null));
}

function overLength(product, limits) {
  return Object.keys(limits).some(
    (field) => String(product[field] ?? "").length > limits[field],
  );
}

async function reportCatalogShape() {
  const products = await Product.find(
    {},
    { name: 1, code: 1, category: 1, usage: 1, description: 1, imageUrl: 1 },
  ).lean();

  const overLegacy = products.filter((p) => overLength(p, LEGACY_LIMITS));
  const overCurrent = products.filter((p) => overLength(p, CURRENT_LIMITS));
  // category က title လို ရှည်နေပြီး name က တိုနေရင် — စာသား နေရာလွဲနေတဲ့ row။
  const misplaced = products.filter(
    (p) => (p.category || "").length > (p.name || "").length + 20,
  );

  console.log(`catalog: ${products.length} product(s)`);
  console.log(`  over the old caps ${JSON.stringify(LEGACY_LIMITS)}: ${overLegacy.length}`);
  console.log(`  over the new caps ${JSON.stringify(CURRENT_LIMITS)}: ${overCurrent.length}`);
  console.log(`  category far longer than name (likely misplaced): ${misplaced.length}`);

  for (const p of misplaced.slice(0, 5)) {
    console.log(
      `    ${p._id} name="${(p.name || "").slice(0, 24)}" (${(p.name || "").length})` +
        ` category="${(p.category || "").slice(0, 40)}" (${(p.category || "").length})`,
    );
  }
  if (misplaced.length > 5) console.log(`    ... ${misplaced.length - 5} more`);
}

async function syncSnapshots({ apply }) {
  const products = await Product.find(
    {},
    { name: 1, code: 1, category: 1, usage: 1, description: 1, imageUrl: 1 },
  ).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const stale = [];
  let missingProduct = 0;

  const cursor = Task.find({ status: { $ne: "completed" }, productId: { $ne: null } })
    .select(SNAPSHOT_FIELDS.join(" ") + " productId")
    .lean()
    .cursor();

  for await (const task of cursor) {
    const product = byId.get(String(task.productId));

    if (!product) {
      missingProduct += 1;
      continue;
    }

    const snapshot = snapshotFrom(product);

    if (!differs(task, snapshot)) continue;

    stale.push({ updateOne: { filter: { _id: task._id }, update: { $set: snapshot } } });
  }

  console.log(
    `open tasks: ${stale.length} stale snapshot(s)` +
      (missingProduct ? `, ${missingProduct} pointing at a deleted product (skipped)` : ""),
  );

  if (stale.length === 0) return;

  if (!apply) {
    console.log("report only — re-run with --apply to write");
    return;
  }

  const result = await Task.bulkWrite(stale);
  console.log(`updated ${result.modifiedCount} task(s)`);
}

(async () => {
  const apply = process.argv.includes("--apply");
  await connectDB();

  await reportCatalogShape();
  await syncSnapshots({ apply });

  if (!apply) console.log("\nno changes written");

  await mongoose.disconnect();
})().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
