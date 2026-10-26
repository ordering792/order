// Scratch concurrency stress harness — run with: node scripts/concurrency-stress.js
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.CLIENT_ORIGIN = "http://localhost:3000";
process.env.IMAGEKIT_PUBLIC_KEY = "pk_test";
process.env.IMAGEKIT_PRIVATE_KEY = "sk_test";
process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/test";
process.env.MONGOMS_SYSTEM_BINARY = String.raw`C:\Users\Lenovo\.cache\mongodb-binaries\mongod-x64-win32-7.0.24.exe`;
process.env.MONGOMS_STORAGE_ENGINE = "wiredTiger";

const app = require("../src/app");
const User = require("../src/models/User");
const Product = require("../src/models/Product");
const Task = require("../src/models/Task");
const OrderPlan = require("../src/models/OrderPlan");
const Transaction = require("../src/models/Transaction");
const WalletLedger = require("../src/models/WalletLedger");

const results = [];
function check(name, verdict, detail) {
  results.push({ name, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${name}${detail ? `\n            ${detail}` : ""}`);
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

let BASE;
let seq = 0;

async function mkUser(role = "user", balance = "0.00") {
  seq += 1;
  return User.create({
    name: `${role}${seq}`,
    phone: `0900000${String(seq).padStart(3, "0")}`,
    passwordHash: await bcrypt.hash("password123", 10),
    invitationCode: `CODE${seq}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    role,
    balance,
    walletAddress: "USDT-TXYZdefault",
    cryptoAddress: "USDT-RECIPIENT",
  });
}

async function post(path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return { status: r.status, body: json };
}

async function clearAll() {
  for (const name of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[name].deleteMany({});
  }
}

async function seedPlanAndTasks(user, totalOrders) {
  // Wide, dense price band so generateOrders' 80-100% selection always has stock.
  for (let i = 1; i <= 100; i += 1) {
    await Product.create({
      name: `Item ${i}`,
      price: (10 * i).toFixed(2),
      code: `P${String(i).padStart(3, "0")}`,
      category: "Office",
    });
  }
  const plan = await OrderPlan.create({
    userId: user._id,
    totalOrders,
    status: "draft",
    completedCount: 0,
    luckyPositions: [],
  });
  const products = await Product.find().sort({ price: 1 });
  await Task.insertMany(
    products.slice(0, totalOrders).map((p, i) => ({
      userId: user._id,
      orderPlanId: plan._id,
      orderNumber: i + 1,
      productName: p.name,
      productId: p._id,
      code: p.code,
      category: p.category,
      price: p.price,
      commission: "2.50",
      isLuckyOrder: false,
      status: "available",
    })),
  );
  plan.status = "generated";
  await plan.save();
  return plan;
}

// 1 — withdrawal reserves nothing at request time
async function scenarioWithdrawFlood() {
  await clearAll();
  const u = await mkUser("user", "1000.00");
  const t = makeToken(u);

  const out = await Promise.all(
    Array.from({ length: 6 }, () =>
      post("/api/transactions", t, {
        type: "withdraw",
        amount: "1000.00",
        password: "password123",
      }),
    ),
  );

  const pending = await Transaction.countDocuments({ userId: u._id, type: "withdraw", status: "pending" });
  const after = await User.findById(u._id);

  check(
    "withdraw flood: 6x full-balance withdrawals from a 1000 balance",
    pending === 1 ? "PASS" : "EXPLOIT",
    `pendingWithdrawals=${pending} balance=${after.balance} statuses=${out.map((r) => r.status).join(",")}`,
  );

  // Now have an admin approve them all concurrently.
  const admin = await mkUser("admin");
  const txs = await Transaction.find({ userId: u._id, type: "withdraw" });
  const acc = await Promise.all(
    txs.map((tx) => post(`/api/transactions/admin/${tx._id}/accept`, makeToken(admin), {})),
  );
  const final = await User.findById(u._id);
  const ok200 = acc.filter((r) => r.status === 200).length;

  check(
    "withdraw flood: approving all of them must not overdraw the balance",
    Number(final.balance) >= 0 ? "PASS" : "EXPLOIT",
    `approvals=${ok200}/${acc.length} finalBalance=${final.balance} statuses=${acc.map((r) => r.status).join(",")}`,
  );
}

// 2 — same transaction approved by two admins at once (the README guarantee)
async function scenarioDoubleApprove() {
  await clearAll();
  const a1 = await mkUser("admin");
  const a2 = await mkUser("admin");
  const u = await mkUser("user", "0.00");

  const tx = await Transaction.create({
    userId: u._id,
    type: "deposit",
    amount: "500.00",
    status: "pending",
  });

  const out = await Promise.all([
    post(`/api/transactions/admin/${tx._id}/accept`, makeToken(a1), {}),
    post(`/api/transactions/admin/${tx._id}/accept`, makeToken(a2), {}),
    post(`/api/transactions/admin/${tx._id}/accept`, makeToken(a1), {}),
  ]);

  const after = await User.findById(u._id);
  check(
    "double approve: one deposit credited exactly once",
    Number(after.balance) === 500 ? "PASS" : "EXPLOIT",
    `balance=${after.balance} statuses=${out.map((r) => r.status).join(",")}`,
  );
}

// 3 — audit trail: is the ledger reconcilable with the balance?
async function scenarioLedgerReconciles() {
  await clearAll();
  const admin = await mkUser("admin");
  const u = await mkUser("user", "0.00");

  const txs = await Transaction.insertMany(
    Array.from({ length: 8 }, () => ({
      userId: u._id,
      type: "deposit",
      amount: "100.00",
      status: "pending",
    })),
  );

  await Promise.all(
    txs.map((tx) => post(`/api/transactions/admin/${tx._id}/accept`, makeToken(admin), {})),
  );

  const after = await User.findById(u._id);
  const agg = await WalletLedger.aggregate([
    { $match: { userId: u._id } },
    {
      $group: {
        _id: null,
        net: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", { $multiply: ["$amount", -1] }] },
        },
        rows: { $sum: 1 },
      },
    },
  ]);
  const net = Number(agg[0]?.net ?? 0);
  const rows = agg[0]?.rows ?? 0;

  check(
    "ledger reconciles with balance (audit trail integrity)",
    Number(after.balance) === net ? "PASS" : "GAP",
    `balance=${after.balance} ledgerNet=${net} ledgerRows=${rows} -> deposit/withdraw approvals write no WalletLedger row`,
  );
}

// 4 — same user double-clicks "match": must not claim two orders
async function scenarioConcurrentMatch() {
  await clearAll();
  const u = await mkUser("user", "600.00");
  await seedPlanAndTasks(u, 5);
  const t = makeToken(u);

  const out = await Promise.all(
    Array.from({ length: 6 }, () => post("/api/tasks/match", t, {})),
  );

  const assigned = await Task.countDocuments({ userId: u._id, status: "assigned" });
  check(
    "match: 6 concurrent clicks must not claim more than one order",
    assigned === 1 ? "PASS" : "EXPLOIT",
    `assignedTasks=${assigned} statuses=${out.map((r) => r.status).join(",")} ` +
      `loserMsg="${out.find((r) => r.status >= 400)?.body?.message || ""}"`,
  );
}

// 5 — same plan generated twice at once
async function scenarioDoubleGenerate() {
  await clearAll();
  for (let i = 1; i <= 100; i += 1) {
    await Product.create({
      name: `Gen ${i}`,
      price: (10 * i).toFixed(2),
      code: `G${String(i).padStart(3, "0")}`,
      category: "Office",
    });
  }
  const admin = await mkUser("admin");
  const u = await mkUser("user", "0.00");
  const at = makeToken(admin);

  const created = await post("/api/orders/plans", at, {
    userId: u._id.toString(),
    totalOrders: 5,
  });
  const planId = created.body?.plan?._id;
  if (!planId) {
    check("plan creation for generate stress", "ERROR", `status=${created.status} ${JSON.stringify(created.body)}`);
    return;
  }

  const dep = await Transaction.create({ userId: u._id, type: "deposit", amount: "3000.00", status: "pending" });
  await post(`/api/transactions/admin/${dep._id}/accept`, at, {});

  const out = await Promise.all(
    Array.from({ length: 5 }, () => post(`/api/orders/plans/${planId}/generate`, at, { depositTransactionId: dep._id.toString() })),
  );

  const tasks = await Task.countDocuments({ userId: u._id });
  check(
    "generate: 5 concurrent calls create exactly one set of 5 orders",
    tasks === 5 ? "PASS" : "EXPLOIT",
    `tasks=${tasks} statuses=${out.map((r) => r.status).join(",")} ${out.find((r) => r.status >= 400)?.body?.message || ""}`,
  );
}

// 6 — two admins create a plan for the same user at the same time
async function scenarioConcurrentCreatePlan() {
  await clearAll();
  const a1 = await mkUser("admin");
  const a2 = await mkUser("admin");
  const u = await mkUser("user", "0.00");

  const out = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      post("/api/orders/plans", makeToken(i % 2 ? a1 : a2), {
        userId: u._id.toString(),
        totalOrders: 5,
      }),
    ),
  );

  const drafts = await OrderPlan.countDocuments({ userId: u._id, status: "draft" });
  check(
    "createPlan: only one active plan per user (guard is check-then-create)",
    drafts === 1 ? "PASS" : "EXPLOIT",
    `draftPlans=${drafts} (expected 1) statuses=${out.map((r) => r.status).join(",")} ${out.find((r) => r.status >= 400)?.body?.message || ""}`,
  );
}

// 7 — the same assigned order completed twice at once
async function scenarioConcurrentComplete() {
  await clearAll();
  const u = await mkUser("user", "600.00");
  await seedPlanAndTasks(u, 5);

  const m = await post("/api/tasks/match", makeToken(u), {});
  const taskId = m.body?.order?.id || m.body?.order?._id;
  if (!taskId) {
    check("match for complete stress", "ERROR", `status=${m.status} ${JSON.stringify(m.body)}`);
    return;
  }

  const before = await User.findById(u._id);
  const out = await Promise.all(
    Array.from({ length: 4 }, () => post(`/api/tasks/complete/${taskId}`, makeToken(u), {})),
  );

  const after = await User.findById(u._id);
  const done = await Task.countDocuments({ _id: taskId, status: "completed" });
  check(
    "complete: same order completed concurrently credits commission once",
    done === 1 && out.filter((r) => r.status < 400).length === 1
      ? "PASS"
      : "EXPLOIT",
    `balance ${before.balance} -> ${after.balance} ok=${out.filter((r) => r.status < 400).length}/4 statuses=${out.map((r) => r.status).join(",")}`,
  );
}

(async () => {
  const rs = await MongoMemoryReplSet.create({
    replSet: { name: "stressset", count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ port: 47119 }],
  });
  await mongoose.connect(rs.getUri());

  const server = await new Promise((res) => {
    const s = app.listen(0, () => res(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}`;

  await scenarioWithdrawFlood();
  await scenarioDoubleApprove();
  await scenarioLedgerReconciles();
  await scenarioConcurrentMatch();
  await scenarioDoubleGenerate();
  await scenarioConcurrentCreatePlan();
  await scenarioConcurrentComplete();

  await new Promise((res) => server.close(res));

  const bad = results.filter((r) => r.verdict !== "PASS");
  console.log(`\n${results.length - bad.length}/${results.length} concurrency checks passed under real parallel load.`);
  for (const b of bad) console.log(` [${b.verdict}] ${b.name}\n     ${b.detail}`);

  await mongoose.disconnect();
  await rs.stop();
  process.exit(0);
})().catch(async (e) => {
  console.error("harness error:", e);
  process.exit(1);
});
