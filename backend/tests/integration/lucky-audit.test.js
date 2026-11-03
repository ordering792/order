const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

jest.mock("../../src/socket", () => ({
  setupSocket: jest.fn(),
  getIO: jest.fn(),
  emitToConversation: jest.fn(),
  emitToAdmins: jest.fn(),
  emitToUser: jest.fn(),
  isUserOnline: jest.fn(() => false),
  isGuestOnline: jest.fn(() => false),
  onlineUsers: new Map(),
  onlineGuests: new Map(),
}));

const app = require("../../src/app");
const User = require("../../src/models/User");
const Product = require("../../src/models/Product");
const Task = require("../../src/models/Task");
const WalletLedger = require("../../src/models/WalletLedger");
const Transaction = require("../../src/models/Transaction");
const OrderPlan = require("../../src/models/OrderPlan");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

beforeAll(async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  for (const name of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[name].deleteMany({});
  }
});

// ---- independent measurement helpers (no app utils) -------------------------
const cents = (value) => {
  const raw =
    value && typeof value === "object" && value.$numberDecimal
      ? value.$numberDecimal
      : String(value);
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = body.split(".");
  const padded = `${fraction}00`.slice(0, 2);
  const centsValue = BigInt(whole) * 100n + BigInt(padded);
  return negative ? -centsValue : centsValue;
};

const yuan = (centsValue) =>
  `${(Number(centsValue) / 100).toFixed(2)}`;

// 0.50% commission, half-up — written independently of orderSelection.js
const expectedCommission = (priceCents) => (5n * priceCents + 500n) / 1000n;

async function makeUser(role = "user", extra = {}) {
  const passwordHash = await bcrypt.hash("password123", 10);
  return User.create({
    name: `${role}-test`,
    phone: `09${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`,
    passwordHash,
    invitationCode: `C${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    role,
    // requireLicense က match/submit/complete ကို တားလို့ default လက်မှတ်ထိုးပြီးထားတယ်။
    licenseAcceptedAt: new Date(),
    ...extra,
  });
}

const token = (user) =>
  jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "1h" });

const authed = (user) => ({ Authorization: `Bearer ${token(user)}` });

const createPlan = async (admin, userId, totalOrders, luckyPositions) => {
  const res = await request(app)
    .post("/api/orders/plans")
    .set(authed(admin))
    .send({ userId, totalOrders, luckyPositions });
  if (res.status !== 201) {
    throw new Error(`createPlan ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.plan;
};

const deposit = async (user, amount) => {
  const res = await request(app)
    .post("/api/transactions")
    .set(authed(user))
    .send({
      type: "deposit",
      amount,
      proofScreenshot: "https://ik.imagekit.io/test/d/proof.png",
    });
  if (res.status !== 201) {
    throw new Error(`deposit ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.transaction;
};

const accept = async (admin, tx) => {
  const transactionId = typeof tx === "string" ? tx : tx._id.toString();
  const res = await request(app)
    .post(`/api/transactions/admin/${transactionId}/accept`)
    .set(authed(admin))
    .send({});
  if (res.status !== 200) {
    throw new Error(`accept ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.transaction;
};

const acceptDeposit = async (admin, user, amount) => {
  const tx = await deposit(user, amount);
  return (await accept(admin, tx._id.toString()))._id.toString();
};

const generate = async (admin, planId, depositTransactionId) => {
  const res = await request(app)
    .post(`/api/orders/plans/${planId}/generate`)
    .set(authed(admin))
    .send({ depositTransactionId });
  if (res.status !== 201) {
    throw new Error(`generate ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.plan;
};

const summary = async (user) => {
  const res = await request(app).get("/api/tasks/summary").set(authed(user));
  if (res.status !== 200) {
    throw new Error(`summary ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.summary;
};

const match = async (user) => {
  const res = await request(app).post("/api/tasks/match").set(authed(user));
  return { status: res.status, body: res.body };
};

const complete = async (user, taskId) => {
  const res = await request(app)
    .post(`/api/tasks/complete/${taskId}`)
    .set(authed(user))
    .send({});
  return { status: res.status, body: res.body };
};

async function seedProducts(prices) {
  return Product.insertMany(
    prices.map((price, index) => ({
      name: `Audit-${index}-${price}`,
      price,
      code: `A${String(index).padStart(3, "0")}`,
      category: "Audit",
    })),
  );
}

// 12 products: 5 inside the 800-1000 band, 7 inside the 1000-1250 band
const CATALOG = [
  "800.00", "840.00", "880.00", "920.00", "960.00", "1000.00",
  "1040.00", "1080.00", "1120.00", "1160.00", "1200.00", "1240.00",
];

describe("Lucky order + order generation audit", () => {
  it("generates every order inside its projected band with exact commission", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    const products = await seedProducts(CATALOG);
    void products;

    const plan = await createPlan(admin, user._id.toString(), 5, [
      {
        orderNumber: 2,
        requiredDeposit: "250.00",
        luckyCommission: "60.00",
      },
      { orderNumber: 4, requiredDeposit: "0.00", luckyCommission: "15.00" },
    ]);

    const generated = await generate(
      admin,
      plan._id,
      await acceptDeposit(admin, user, "1000.00"),
    );
    expect(generated.status).toBe("generated");

    const tasks = await Task.find({ orderPlanId: plan._id }).sort({
      orderNumber: 1,
    });
    expect(tasks).toHaveLength(5);
    expect(tasks.map((t) => t.orderNumber)).toEqual([1, 2, 3, 4, 5]);

    // projected base: +250 after lucky order 2 (order 3+), +0 after order 4
    const bases = [100000n, 100000n, 125000n, 125000n, 125000n];

    tasks.forEach((task, index) => {
      const base = bases[index];
      const lo = (base * 80n) / 100n;
      const price = cents(task.price);
      expect(price >= lo && price <= base).toBe(true);
      expect(task.orderNumber).toBe(index + 1);
    });

    expect(tasks[1].isLuckyOrder).toBe(true);
    expect(tasks[3].isLuckyOrder).toBe(true);
    expect([0, 2, 4].every((i) => !tasks[i].isLuckyOrder)).toBe(true);

    // lucky commissions come from the plan, not from the 0.50% formula
    expect(cents(tasks[1].commission)).toBe(cents("60.00"));
    expect(cents(tasks[3].commission)).toBe(cents("15.00"));

    for (const index of [0, 2, 4]) {
      expect(cents(tasks[index].commission)).toBe(
        expectedCommission(cents(tasks[index].price)),
      );
    }
  });

  it("uses the admin-picked product for a lucky order and keeps it in band", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    const products = await seedProducts(CATALOG);
    const luckyPick = products.find((p) => p.price.toString() === "960.00");

    const plan = await createPlan(admin, user._id.toString(), 3, [
      {
        orderNumber: 2,
        productId: luckyPick._id.toString(),
        requiredDeposit: "100.00",
        luckyCommission: "12.00",
      },
    ]);

    await generate(
      admin,
      plan._id,
      await acceptDeposit(admin, user, "1000.00"),
    );

    const luckyTask = await Task.findOne({
      orderPlanId: plan._id,
      orderNumber: 2,
    });
    expect(luckyTask.productId.toString()).toBe(luckyPick._id.toString());
    expect(cents(luckyTask.price)).toBe(96000n);
    expect(luckyTask.isLuckyOrder).toBe(true);

    // the reserved product must not be reused for a normal order
    const duplicates = await Task.countDocuments({
      orderPlanId: plan._id,
      productId: luckyPick._id,
    });
    expect(duplicates).toBe(1);
  });

  it("rejects a lucky product priced outside the band", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    const products = await seedProducts(CATALOG);
    const tooCheap = products.find((p) => p.price.toString() === "800.00");

    const plan = await createPlan(admin, user._id.toString(), 2, [
      {
        orderNumber: 1,
        productId: tooCheap._id.toString(),
        requiredDeposit: "0.00",
        luckyCommission: "5.00",
      },
    ]);

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set(authed(admin))
      .send({
        depositTransactionId: await acceptDeposit(admin, user, "1000.00"),
      });

    // 800.00 is inside [800, 1000] for order 1, so this must pass
    expect(res.status).toBe(201);

    const expensive = await Product.create({ name: "Overpriced", price: "1500.00" });
    const plan2 = await createPlan(admin, (await makeUser())._id.toString(), 2, [
      {
        orderNumber: 1,
        productId: expensive._id.toString(),
        requiredDeposit: "0.00",
        luckyCommission: "5.00",
      },
    ]);
    const user2 = await User.findById(plan2.userId);
    const res2 = await request(app)
      .post(`/api/orders/plans/${plan2._id}/generate`)
      .set(authed(admin))
      .send({
        depositTransactionId: await acceptDeposit(admin, user2, "1000.00"),
      });
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/outside the allowed range/);
  });

  it("pays exact commissions and blocks a lucky order until its deposit is paid", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser("user", {
      walletAddress: "TQexampleAddress000000000000000000",
    });
    await seedProducts(CATALOG);

    const plan = await createPlan(admin, user._id.toString(), 2, [
      { orderNumber: 2, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);

    await generate(
      admin,
      plan._id,
      await acceptDeposit(admin, user, "1000.00"),
    );

    let snap = await summary(user);
    expect(cents(snap.balance)).toBe(100000n);
    expect(snap.totalOrderNumber).toBe(2);
    expect(snap.remainingCount).toBe(2);
    expect(snap.completedCount).toBe(0);

    // order 1 — normal
    const first = await match(user);
    expect(first.status).toBe(200);
    const firstTask = await Task.findById(first.body.order.id);
    expect(firstTask.orderNumber).toBe(1);
    expect(cents(first.body.order.price)).toBe(cents(firstTask.price));
    expect(cents(first.body.order.profit)).toBe(cents(firstTask.commission));

    const done1 = await complete(user, first.body.order.id);
    expect(done1.status).toBe(200);
    snap = await summary(user);
    expect(cents(snap.balance)).toBe(100000n + cents(firstTask.commission));
    expect(snap.completedCount).toBe(1);

    const ledger1 = await WalletLedger.findOne({ reference: String(firstTask._id) });
    expect(cents(ledger1.amount)).toBe(cents(firstTask.commission));
    expect(cents(ledger1.balance)).toBe(cents(snap.balance));

    // totalCommission only counts task commissions
    expect(cents(snap.totalCommission)).toBe(cents(firstTask.commission));

    // order 2 — lucky, no fresh deposit yet
    const second = await match(user);
    expect(second.status).toBe(200);
    const lucky = second.body.order;
    expect(lucky.isLuckyOrder).toBe(true);
    expect(cents(lucky.requireDeposit)).toBe(25000n);
    expect(lucky.totalAmount).toBeDefined();
    expect(cents(lucky.totalAmount)).toBe(
      cents(lucky.price) + cents(lucky.profit) + 25000n,
    );
    // balance alone does not unlock a plan-based lucky order, so the preflight
    // must agree with what completeTask actually requires
    expect(second.body.needsDeposit).toBe(true);
    expect(cents(second.body.shortBy)).toBe(25000n);

    const blocked = await complete(user, lucky.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/short by 250\.00/);

    // the plan's own initial deposit must never be reused as the lucky deposit
    const planDoc = await OrderPlan.findById(plan._id);
    const reusable = await Transaction.countDocuments({
      userId: user._id,
      type: "deposit",
      status: "accepted",
      amount: decimalOf("1000.00"),
      allocation: null,
    });
    expect(planDoc.initialDepositTxId).toBeDefined();
    expect(reusable).toBe(1); // the 1000 base is untouched, but it funds the round, not a lucky order

    // user pays the exact lucky deposit
    const luckyDeposit = await accept(admin, await deposit(user, "250.00"));
    snap = await summary(user);
    expect(cents(snap.balance)).toBe(
      100000n + cents(firstTask.commission) + 25000n,
    );

    const done2 = await complete(user, lucky.id);
    expect(done2.status).toBe(200);

    const claimedTx = await Transaction.findById(luckyDeposit._id);
    expect(claimedTx.allocation?.taskId?.toString()).toBe(lucky.id);

    const after = await summary(user);
    expect(cents(after.balance)).toBe(
      100000n + cents(firstTask.commission) + 25000n + 6000n,
    );
    expect(cents(after.totalCommission)).toBe(cents(firstTask.commission) + 6000n);
    expect(after.completedCount).toBe(2);

    const updatedPlan = await OrderPlan.findById(plan._id);
    expect(updatedPlan.status).toBe("completed");
    expect(cents(updatedPlan.currentBase)).toBe(125000n);

    // no double-credit: only the two commission rows are booked as credits
    const credits = await WalletLedger.find({
      userId: user._id,
      note: "Task commission",
    });
    expect(credits).toHaveLength(2);
    const luckyLedger = await WalletLedger.find({
      userId: user._id,
      note: "Lucky order deposit",
    });
    expect(luckyLedger).toHaveLength(0); // plan-based lucky never debits balance
  });

  it("refuses to spend one accepted lucky deposit on two lucky orders", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    await seedProducts(CATALOG);

    const plan = await createPlan(admin, user._id.toString(), 3, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
      { orderNumber: 2, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);

    const initialDeposit = await accept(admin, await deposit(user, "1000.00"));
    await generate(admin, plan._id, initialDeposit._id.toString());

    const first = await match(user);
    expect(first.body.order.orderNumber).toBe(1);
    expect(first.body.order.isLuckyOrder).toBe(true);

    // order 1 ကျပြီးမှ 250 သွင်း — order 2 အတွက် ဒီငွေက အချိန်အရ အရင်ဖြစ်သွားလို့ မရ
    await accept(admin, await deposit(user, "250.00"));
    expect((await complete(user, first.body.order.id)).status).toBe(200);

    const second = await match(user);
    expect(second.body.order.orderNumber).toBe(2);
    expect(second.body.needsDeposit).toBe(true);
    const starved = await complete(user, second.body.order.id);
    expect(starved.status).toBe(400);
    expect(starved.body.message).toMatch(/short by 250\.00/);

    // the claimed deposit cannot be claimed twice
    const claimedOnce = await Transaction.countDocuments({
      userId: user._id,
      allocation: { $ne: null },
    });
    expect(claimedOnce).toBe(1);

    // paying a second, fresh 250 unblocks order 2
    await accept(admin, await deposit(user, "250.00"));
    expect((await complete(user, second.body.order.id)).status).toBe(200);

    const third = await match(user);
    expect(third.body.order.isLuckyOrder).toBe(false);
    expect((await complete(user, third.body.order.id)).status).toBe(200);

    const planDoc = await OrderPlan.findById(plan._id);
    expect(planDoc.status).toBe("completed");
    expect(cents(planDoc.currentBase)).toBe(
      cents(planDoc.initialDeposit) + 50000n,
    );

    // the plan's initial deposit is never consumed as a lucky deposit
    const initial = await Transaction.findById(initialDeposit._id);
    expect(initial.allocation).toBeNull();
    expect(await Transaction.countDocuments({ allocation: { $ne: null } })).toBe(2);
  });

  it("enforces sequence, blocks early withdrawal and resets counters on round 2", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser("user", {
      walletAddress: "TQexampleAddress000000000000000000",
    });
    await seedProducts(CATALOG);

    const plan = await createPlan(admin, user._id.toString(), 2);
    await generate(
      admin,
      plan._id,
      await acceptDeposit(admin, user, "1000.00"),
    );

    const tasks = await Task.find({ orderPlanId: plan._id }).sort({
      orderNumber: 1,
    });

    // completing order 2 before order 1 — first by the "must be matched first" guard
    const wrong = await complete(user, tasks[1]._id.toString());
    expect(wrong.status).toBe(409);
    expect(wrong.body.message).toMatch(/not matched yet/);

    // and, once force-assigned, by the plan sequence guard itself
    await Task.updateOne({ _id: tasks[1]._id }, { status: "assigned" });
    const outOfOrder = await complete(user, tasks[1]._id.toString());
    expect(outOfOrder.status).toBe(409);
    expect(outOfOrder.body.message).toMatch(/in sequence/);
    await Task.updateOne({ _id: tasks[1]._id }, { status: tasks[1].status });

    // match always hands out the lowest open order
    const matched = await match(user);
    expect(matched.body.order.orderNumber).toBe(1);

    // withdrawal is blocked while the plan is unfinished
    const earlyWithdraw = await request(app)
      .post("/api/transactions")
      .set(authed(user))
      .send({ type: "withdraw", amount: "50.00", password: "password123" });
    expect(earlyWithdraw.status).toBe(409);

    await complete(user, matched.body.order.id);
    const second = await match(user);
    await complete(user, second.body.order.id);

    const snap = await summary(user);
    expect(snap.completedCount).toBe(2);
    expect(snap.remainingCount).toBe(0);
    expect(cents(snap.balance)).toBe(
      100000n +
        cents(tasks[0].commission) +
        cents(tasks[1].commission),
    );

    const withdrawOk = await request(app)
      .post("/api/transactions")
      .set(authed(user))
      .send({ type: "withdraw", amount: "50.00", password: "password123" });
    expect(withdrawOk.status).toBe(201);
    expect(withdrawOk.body.transaction.status).toBe("pending");
    // the request alone must not move money — only admin approval debits
    expect(cents((await summary(user)).balance)).toBe(cents(snap.balance));

    const wrongPassword = await request(app)
      .post("/api/transactions")
      .set(authed(user))
      .send({ type: "withdraw", amount: "10.00", password: "nope-nope-nope" });
    // 400 — 401 ဖြစ်ရင် client က session ဖျက်ပြီး logout လုပ်ချလိုက်တယ်
    expect(wrongPassword.status).toBe(400);

    await accept(admin, withdrawOk.body.transaction);
    expect(cents((await summary(user)).balance)).toBe(
      cents(snap.balance) - 5000n,
    );

    // a request bigger than the balance is accepted at ask time and
    // refused only when approved (no request-time reserve — see audit notes)
    const oversized = await request(app)
      .post("/api/transactions")
      .set(authed(user))
      .send({
        type: "withdraw",
        amount: yuan(cents(snap.balance) + 1n),
        password: "password123",
      });
    expect(oversized.status).toBe(201);
    const oversizeAccept = await request(app)
      .post(`/api/transactions/admin/${oversized.body.transaction._id}/accept`)
      .set(authed(admin))
      .send({});
    expect(oversizeAccept.status).toBe(400);
    expect(oversizeAccept.body.message).toMatch(/Insufficient balance/);
    expect(cents((await summary(user)).balance)).toBe(
      cents(snap.balance) - 5000n,
    );

    // ---- round 2 ----
    const round1TaskIds = (
      await Task.find({ orderPlanId: plan._id }).select("_id")
    ).map((t) => String(t._id));

    const plan2 = await createPlan(admin, user._id.toString(), 3, [
      { orderNumber: 1, requiredDeposit: "200.00", luckyCommission: "30.00" },
    ]);
    await generate(
      admin,
      plan2._id,
      await acceptDeposit(admin, user, "800.00"),
    );

    const snap2 = await summary(user);
    expect(snap2.totalOrderNumber).toBe(3);
    expect(snap2.completedCount).toBe(0);
    expect(snap2.remainingCount).toBe(3);
    expect(snap2.undoneCount).toBe(0);

    const round2Tasks = await Task.find({ orderPlanId: plan2._id }).sort({
      orderNumber: 1,
    });
    expect(round2Tasks.map((t) => t.orderNumber)).toEqual([1, 2, 3]);
    expect(round2Tasks[0].isLuckyOrder).toBe(true);
    // round-1 tasks are untouched
    expect(
      await Task.countDocuments({ _id: { $in: round1TaskIds }, status: "completed" }),
    ).toBe(2);
    expect(await Task.countDocuments({ userId: user._id })).toBe(5);

    // /api/tasks/orders lists only matched-or-completed orders of the CURRENT
    // plan, so round 2 starts empty and round 1's ORD-001/002 never reappear.
    const ordersRes = await request(app).get("/api/tasks/orders").set(authed(user));
    expect(ordersRes.body.tasks).toHaveLength(0);
    expect(ordersRes.body.plan.totalOrders).toBe(3);

    // the lucky deposit for round 2 must be fresh, not a round-1 leftover
    const r2 = await match(user);
    expect(cents(r2.body.order.requireDeposit)).toBe(20000n);
    const blocked2 = await complete(user, r2.body.order.id);
    expect(blocked2.status).toBe(400);
    expect(blocked2.body.message).toMatch(/short by 200\.00/);

    const afterMatch = await request(app)
      .get("/api/tasks/orders")
      .set(authed(user));
    expect(afterMatch.body.tasks.map((t) => t.orderNumber)).toEqual([1]);
    expect(afterMatch.body.tasks[0].status).toBe("assigned");
  });

  it("makes the match preflight agree with the deposit completion claims", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    await seedProducts(CATALOG);

    const plan = await createPlan(admin, user._id.toString(), 2, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);
    await generate(admin, plan._id, await acceptDeposit(admin, user, "1000.00"));

    // balance is 1000.00 — far above the 250.00 deposit, yet nothing is claimable
    const before = await match(user);
    expect(before.body.balance).toBe("1000.00");
    expect(before.body.order.isLuckyOrder).toBe(true);
    expect(before.body.needsDeposit).toBe(true);
    expect(cents(before.body.shortBy)).toBe(25000n);
    expect((await complete(user, before.body.order.id)).status).toBe(400);

    const luckyId = before.body.order.id;

    // paying the exact amount flips the preflight, and completion then succeeds
    await accept(admin, await deposit(user, "250.00"));
    const after = await match(user);
    expect(after.body.order.id).toBe(luckyId);
    expect(after.body.needsDeposit).toBe(false);
    expect(cents(after.body.shortBy)).toBe(0n);
    expect((await complete(user, luckyId)).status).toBe(200);

    // a normal order never asks for a deposit
    const third = await match(user);
    expect(third.body.order.isLuckyOrder).toBe(false);
    expect(third.body.needsDeposit).toBe(false);
    expect(cents(third.body.shortBy)).toBe(0n);
    expect((await complete(user, third.body.order.id)).status).toBe(200);
  });
});

// ငွေခွဲသွင်းတဲ့ user — lucky deposit တစ်ခုကို lucky order ကျပြီးမှ ထပ်သွင်းတဲ့
// accepted deposit တွေပေါင်းလဒ်နဲ့ ဖည့်တယ်။ (order ကျခင်က ငွေ မရေတွက်ဘူး)
describe("Lucky order split deposits", () => {
  async function luckySetup(admin, user, positions) {
    await seedProducts(CATALOG);
    const plan = await createPlan(admin, user._id.toString(), 3, positions);
    await generate(admin, plan._id, await acceptDeposit(admin, user, "1000.00"));
    return plan;
  }

  it("pays a 250.00 lucky deposit with a 100.00 and a 150.00 deposit", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    const plan = await luckySetup(admin, user, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);

    // order ကျမှ (assign ဖြစ်မှ) deposit သွင်းခွင့်ရ — fence က assignedAt ကို ကြည့်တယ်
    const matched = await match(user);
    expect(matched.status).toBe(200);
    expect(matched.body.order.isLuckyOrder).toBe(true);
    expect(matched.body.needsDeposit).toBe(true);
    expect(cents(matched.body.shortBy)).toBe(25000n);

    const first = await accept(admin, await deposit(user, "100.00"));
    const second = await accept(admin, await deposit(user, "150.00"));

    const ready = await match(user);
    expect(ready.body.order.id).toBe(matched.body.order.id);
    expect(ready.body.needsDeposit).toBe(false);
    expect(cents(ready.body.shortBy)).toBe(0n);

    expect((await complete(user, ready.body.order.id)).status).toBe(200);

    const txFirst = await Transaction.findById(first._id);
    const txSecond = await Transaction.findById(second._id);
    expect(cents(txFirst.appliedAmount)).toBe(10000n);
    expect(cents(txSecond.appliedAmount)).toBe(15000n);
    expect(txFirst.allocation?.taskId?.toString()).toBe(ready.body.order.id);
    expect(txSecond.allocation?.taskId?.toString()).toBe(ready.body.order.id);

    // the round base grew by exactly the required deposit, and the plan path
    // still never debits the user's balance
    expect(cents((await OrderPlan.findById(plan._id)).currentBase)).toBe(125000n);
    expect(
      await WalletLedger.countDocuments({
        userId: user._id,
        note: "Lucky order deposit",
      }),
    ).toBe(0);
  });

  it("asks the preflight for the remainder, and ignores unaccepted deposits", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    await luckySetup(admin, user, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);

    const before = await match(user);
    expect(before.body.needsDeposit).toBe(true);
    expect(cents(before.body.shortBy)).toBe(25000n);

    await accept(admin, await deposit(user, "100.00"));
    const partial = await match(user);
    expect(partial.body.order.id).toBe(before.body.order.id);
    expect(partial.body.needsDeposit).toBe(true);
    expect(cents(partial.body.shortBy)).toBe(15000n);

    // pending ကို admin မaccept ချင်သေး — ရာသက်ပန် မရေတွက်ဘူး
    await deposit(user, "80.00");
    expect(cents((await match(user)).body.shortBy)).toBe(15000n);

    await accept(admin, await deposit(user, "150.00"));
    const ready = await match(user);
    expect(ready.body.needsDeposit).toBe(false);
    expect(cents(ready.body.shortBy)).toBe(0n);
    expect((await complete(user, ready.body.order.id)).status).toBe(200);
  });

  it("will not carry one lucky order's leftover deposit into the next order", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    await luckySetup(admin, user, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
      { orderNumber: 2, requiredDeposit: "100.00", luckyCommission: "30.00" },
    ]);

    const one = await match(user);
    const big = await accept(admin, await deposit(user, "300.00"));

    expect((await complete(user, one.body.order.id)).status).toBe(200);
    expect(cents((await Transaction.findById(big._id)).appliedAmount)).toBe(25000n);

    // order 2 အတွက် 50.00 ကျန်တဲ့ deposit ကို ပြန်မသုံးဘူး — အသစ်ပဲ ထပ်သွင်းရမယ်
    const two = await match(user);
    expect(cents(two.body.order.requireDeposit)).toBe(10000n);
    expect(two.body.needsDeposit).toBe(true);
    expect(cents(two.body.shortBy)).toBe(10000n);

    const blocked = await complete(user, two.body.order.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/short by 100\.00/);

    await accept(admin, await deposit(user, "100.00"));
    expect((await complete(user, two.body.order.id)).status).toBe(200);

    const txBig = await Transaction.findById(big._id);
    expect(cents(txBig.appliedAmount)).toBe(25000n); // 50.00 surplus ကို ဘယ်သူမှ မထိဘူး
    expect(txBig.allocation?.taskId?.toString()).toBe(one.body.order.id);
  });

  it("still refuses a lucky order when the split deposits do not add up", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    await luckySetup(admin, user, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);

    const matched = await match(user);
    await accept(admin, await deposit(user, "100.00"));
    await accept(admin, await deposit(user, "50.00"));

    const partial = await match(user);
    expect(partial.body.order.id).toBe(matched.body.order.id);
    expect(partial.body.needsDeposit).toBe(true);
    expect(cents(partial.body.shortBy)).toBe(10000n);

    const blocked = await complete(user, partial.body.order.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/short by 100\.00/);

    // transaction abort — စုထားတဲ့ 150 ကိုပါ မသုံးဘဲ ပြန်လှန်ထားတယ်
    const deposits = await Transaction.find({
      userId: user._id,
      type: "deposit",
      status: "accepted",
    });
    expect(deposits).toHaveLength(3); // 1000 round base + 100 + 50
    for (const tx of deposits) {
      expect(cents(tx.appliedAmount)).toBe(0n);
      expect(tx.allocation).toBeNull();
    }
  });

  it("ignores an accepted deposit made before the lucky order appeared", async () => {
    const admin = await makeUser("admin");
    const user = await makeUser();
    await luckySetup(admin, user, [
      { orderNumber: 1, requiredDeposit: "250.00", luckyCommission: "60.00" },
    ]);

    // order မကျခင် ကြိုထည့်ထားတဲ့ 250 — lucky deposit အဖြစ် မရေတွက်ဘူး
    const early = await accept(admin, await deposit(user, "250.00"));

    const matched = await match(user);
    expect(matched.body.needsDeposit).toBe(true);
    expect(cents(matched.body.shortBy)).toBe(25000n);

    const blocked = await complete(user, matched.body.order.id);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/short by 250\.00/);
    expect(cents((await Transaction.findById(early._id)).appliedAmount)).toBe(0n);

    // order ကျပြီးမှ ထပ်သွင်းတဲ့ 250 ကသာ lucky deposit ဖြစ်တယ်
    await accept(admin, await deposit(user, "250.00"));
    const ready = await match(user);
    expect(ready.body.needsDeposit).toBe(false);
    expect((await complete(user, ready.body.order.id)).status).toBe(200);

    expect(cents((await Transaction.findById(early._id)).appliedAmount)).toBe(0n);
  });
});

function decimalOf(value) {
  return mongoose.Types.Decimal128.fromString(value);
}
