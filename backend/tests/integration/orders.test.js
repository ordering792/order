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

const { emitToAdmins } = require("../../src/socket");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Task = require("../../src/models/Task");
const Product = require("../../src/models/Product");
const OrderPlan = require("../../src/models/OrderPlan");
const Transaction = require("../../src/models/Transaction");
const { decimal } = require("../../src/utils/money");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

beforeAll(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  emitToAdmins.mockClear();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

async function createUser(role = "user", extra = {}) {
  const passwordHash = await bcrypt.hash("password123", 10);
  return User.create({
    name: `${role} user`,
    phone: `09${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`,
    passwordHash,
    invitationCode: `CODE${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`,
    role,
    ...extra,
  });
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function createProduct(price, name = "Product") {
  return Product.create({ name: `${name}-${Math.random()}`, price });
}

describe("Order plan setup (POST /api/orders/plans)", () => {
  it("admin creates a plan with lucky positions", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const luckyProduct = await createProduct("450.00", "Lucky");
    const luckyProduct2 = await createProduct("700.00", "Lucky2");

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 50,
        luckyPositions: [
          {
            orderNumber: 15,
            productId: luckyProduct._id.toString(),
            requiredDeposit: "250.00",
            luckyCommission: "25.00",
          },
          {
            orderNumber: 31,
            productId: luckyProduct2._id.toString(),
            requiredDeposit: "0.00",
            luckyCommission: "10.00",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.plan.status).toBe("draft");
    expect(res.body.plan.totalOrders).toBe(50);
    expect(res.body.plan.luckyPositions).toHaveLength(2);

    const saved = await OrderPlan.findOne({ userId: user._id });
    expect(saved).not.toBeNull();
    expect(saved.luckyPositions[0].productId.toString()).toBe(
      luckyProduct._id.toString(),
    );
    expect(
      parseFloat(saved.luckyPositions[0].requiredDeposit.toString()),
    ).toBeCloseTo(250, 2);

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:plan_created",
      expect.objectContaining({ userId: user._id.toString(), totalOrders: 50 }),
    );
  });

  it("owner creates a plan for their own user", async () => {
    const owner = await createUser("owner");
    const user = await createUser("user", { ownerId: owner._id });

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(owner)}`)
      .send({ userId: user._id.toString(), totalOrders: 40 });

    expect(res.status).toBe(201);
  });

  it("owner cannot create a plan for a foreign user", async () => {
    const owner = await createUser("owner");
    const foreignOwner = await createUser("owner");
    const user = await createUser("user", { ownerId: foreignOwner._id });

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(owner)}`)
      .send({ userId: user._id.toString(), totalOrders: 40 });

    expect(res.status).toBe(403);
  });

  it("plain user cannot create plans", async () => {
    const user = await createUser();

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ userId: user._id.toString(), totalOrders: 10 });

    expect(res.status).toBe(403);
  });

  it("rejects totalOrders out of range", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    const zero = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 0 });

    expect(zero.status).toBe(400);

    const tooMany = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 501 });

    expect(tooMany.status).toBe(400);
  });

  it("rejects lucky position beyond totalOrders", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const product = await createProduct("100.00");

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 10,
        luckyPositions: [
          {
            orderNumber: 11,
            productId: product._id.toString(),
            requiredDeposit: "0.00",
            luckyCommission: "5.00",
          },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("rejects duplicate lucky positions", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const product = await createProduct("100.00");

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 10,
        luckyPositions: [
          {
            orderNumber: 3,
            productId: product._id.toString(),
            requiredDeposit: "0.00",
            luckyCommission: "5.00",
          },
          {
            orderNumber: 3,
            productId: product._id.toString(),
            requiredDeposit: "0.00",
            luckyCommission: "6.00",
          },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("rejects negative required deposit", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const product = await createProduct("100.00");

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 10,
        luckyPositions: [
          {
            orderNumber: 2,
            productId: product._id.toString(),
            requiredDeposit: "-5.00",
            luckyCommission: "5.00",
          },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("rejects unknown product", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const ghostId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 10,
        luckyPositions: [
          {
            orderNumber: 2,
            productId: ghostId.toString(),
            requiredDeposit: "0.00",
            luckyCommission: "5.00",
          },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("rejects a second plan for the same user", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 40 });

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 50 });

    expect(res.status).toBe(409);
  });

  it("rejects a plan when user already has tasks", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    await Task.create({
      userId: user._id,
      orderNumber: 1,
      productName: "Legacy",
      price: "100.00",
      commission: "1.00",
    });

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 40 });

    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown target user", async () => {
    const admin = await createUser("admin");
    const ghostId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: ghostId.toString(), totalOrders: 40 });

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/orders/plans")
      .send({ totalOrders: 40 });

    expect(res.status).toBe(401);
  });
});

describe("Order plan reads", () => {
  it("GET /plans/my returns own plan with nextLuckyDeposit", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const product = await createProduct("450.00");

    await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 20,
        luckyPositions: [
          {
            orderNumber: 5,
            productId: product._id.toString(),
            requiredDeposit: "250.00",
            luckyCommission: "25.00",
          },
        ],
      });

    const res = await request(app)
      .get("/api/orders/plans/my")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.plan.totalOrders).toBe(20);
    expect(res.body.plan.nextLuckyDeposit).toEqual({
      orderNumber: 5,
      requiredDeposit: "250.00",
    });
  });

  it("GET /plans/my returns 404 without a plan", async () => {
    const user = await createUser();

    const res = await request(app)
      .get("/api/orders/plans/my")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(404);
  });

  it("admin can read a plan by id; foreign owner cannot", async () => {
    const admin = await createUser("admin");
    const owner = await createUser("owner");
    const foreignOwner = await createUser("owner");
    const user = await createUser("user", { ownerId: foreignOwner._id });

    const created = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 30 });

    const planId = created.body.plan._id;

    const byAdmin = await request(app)
      .get(`/api/orders/plans/${planId}`)
      .set("Authorization", `Bearer ${makeToken(admin)}`);
    expect(byAdmin.status).toBe(200);

    const byOwner = await request(app)
      .get(`/api/orders/plans/${planId}`)
      .set("Authorization", `Bearer ${makeToken(owner)}`);
    expect(byOwner.status).toBe(403);

    const byForeignOwner = await request(app)
      .get(`/api/orders/plans/${planId}`)
      .set("Authorization", `Bearer ${makeToken(foreignOwner)}`);
    expect(byForeignOwner.status).toBe(200);
  });

  it("admin lists all plans", async () => {
    const admin = await createUser("admin");
    const owner = await createUser("owner");
    const user1 = await createUser("user", { ownerId: owner._id });
    const user2 = await createUser();

    await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user1._id.toString(), totalOrders: 10 });
    await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user2._id.toString(), totalOrders: 20 });

    const res = await request(app)
      .get("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(2);

    const asUser = await request(app)
      .get("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(user1)}`);
    expect(asUser.status).toBe(403);
  });
});

async function seedProducts(prices) {
  return Product.insertMany(
    prices.map((price, index) => ({
      name: `Product ${index} @ ${price}`,
      code: `P${String(index).padStart(4, "0")}`,
      category: "Electronics",
      usage: `Usage note ${index}`,
      description: `Item number ${index}`,
      imageUrl: `https://example.com/p${index}.jpg`,
      price: String(price),
    })),
  );
}

const range400to500 = [];
for (let price = 380; price <= 520; price += 10) range400to500.push(price);

const range600to750 = [];
for (let price = 590; price <= 760; price += 10) range600to750.push(price);

async function makeDeposit(userId, amount, status = "accepted") {
  return Transaction.create({
    userId,
    type: "deposit",
    amount,
    status,
  });
}

async function createPlan(admin, userId, opts = {}) {
  const res = await request(app)
    .post("/api/orders/plans")
    .set("Authorization", `Bearer ${makeToken(admin)}`)
    .send({ userId, totalOrders: opts.totalOrders ?? 10, ...opts.body });

  expect(res.status).toBe(201);
  return res.body.plan;
}

async function setupGeneratedPlan(admin, user, opts = {}) {
  const {
    totalOrders,
    deposit = "500.00",
    luckyPositions = [],
    seeds = [range400to500, range600to750],
  } = opts;

  for (const prices of seeds) {
    await seedProducts(prices);
  }

  const plan = await createPlan(admin, user._id.toString(), {
    totalOrders,
    body: { luckyPositions },
  });
  const depositTx = await makeDeposit(user._id, deposit);

  const res = await request(app)
    .post(`/api/orders/plans/${plan._id}/generate`)
    .set("Authorization", `Bearer ${makeToken(admin)}`)
    .send({ depositTransactionId: depositTx._id.toString() });

  expect(res.status).toBe(201);

  return { planId: plan._id.toString(), depositTx };
}

async function planTasks(userId) {
  return Task.find({ userId }).sort({ orderNumber: 1 });
}

async function completeTask(user, taskId) {
  // Real flow: order ကို match (assign) လုပ်ပြီးမှ complete ခေါ်နိုင်တယ်။
  await Task.updateOne(
    { _id: taskId },
    { $set: { status: "assigned", assignedAt: new Date() } },
  );

  return request(app)
    .post(`/api/tasks/complete/${taskId}`)
    .set("Authorization", `Bearer ${makeToken(user)}`)
    .send({});
}

describe("Lucky order auto product selection", () => {
  it("picks a product automatically when the admin does not choose one", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    const deposit = await makeDeposit(user._id, "500.00");

    // price range ထဲက product တွေ (5 order အတွက် ၆ ခု)
    await Product.insertMany([
      { name: "In Range A", price: "450.00" },
      { name: "In Range B", price: "470.00" },
      { name: "In Range C", price: "430.00" },
      { name: "In Range D", price: "480.00" },
      { name: "In Range E", price: "410.00" },
      { name: "In Range F", price: "490.00" },
      { name: "Cheap One", price: "60.00" },
    ]);

    const planRes = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        userId: user._id.toString(),
        totalOrders: 5,
        luckyPositions: [
          {
            orderNumber: 2,
            requiredDeposit: "0.00",
            luckyCommission: "12.50",
          },
        ],
      });

    expect(planRes.status).toBe(201);

    const gen = await request(app)
      .post(`/api/orders/plans/${planRes.body.plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(gen.status).toBe(201);

    const tasks = await Task.find({ userId: user._id }).sort({
      orderNumber: 1,
    });
    expect(tasks).toHaveLength(5);

    const lucky = tasks.find((t) => t.orderNumber === 2);
    expect(lucky).not.toBeNull();
    expect(lucky.isLuckyOrder).toBe(true);
    expect(lucky.productId).not.toBeNull();
    expect(parseFloat(lucky.price.toString())).toBeGreaterThanOrEqual(400);
    expect(parseFloat(lucky.price.toString())).toBeLessThanOrEqual(500);
    expect(parseFloat(lucky.commission.toString())).toBeCloseTo(12.5, 2);
  });
});

describe("Plan generation (POST /api/orders/plans/:id/generate)", () => {
  it("generates N orders from an accepted deposit with 0.5% commissions", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts(range400to500);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 10,
    });
    const deposit = await makeDeposit(user._id, "500.00");

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(res.status).toBe(201);

    const tasks = await Task.find({ userId: user._id }).sort({
      orderNumber: 1,
    });
    expect(tasks).toHaveLength(10);
    expect(tasks.map((t) => t.orderNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    for (const task of tasks) {
      const price = parseFloat(task.price.toString());
      expect(price).toBeGreaterThanOrEqual(400);
      expect(price).toBeLessThanOrEqual(500);
      expect(parseFloat(task.commission.toString())).toBeCloseTo(
        price * 0.005,
        2,
      );
      expect(task.isLuckyOrder).toBe(false);
      expect(task.productId).not.toBeNull();
      expect(task.imageUrl).toContain("https://example.com/");
      expect(task.description).toBeTruthy();
      expect(task.code).toBeTruthy();
      expect(task.category).toBe("Electronics");
      expect(task.usage).toBeTruthy();
      expect(task.orderPlanId.toString()).toBe(plan._id);
    }

    const updated = await OrderPlan.findById(plan._id);
    expect(updated.status).toBe("generated");
    expect(parseFloat(updated.initialDeposit.toString())).toBeCloseTo(500, 2);
    expect(parseFloat(updated.currentBase.toString())).toBeCloseTo(500, 2);
    expect(updated.initialDepositTxId.toString()).toBe(deposit._id.toString());

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:plan_generated",
      expect.objectContaining({ planId: plan._id, totalOrders: 10 }),
    );
  });

  it("projects base growth after lucky deposits", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts([...range400to500, ...range600to750, 450]);

    const luckyProduct = await Product.create({
      name: "Lucky display",
      price: "450.00",
    });

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 6,
      body: {
        luckyPositions: [
          {
            orderNumber: 3,
            productId: luckyProduct._id.toString(),
            requiredDeposit: "250.00",
            luckyCommission: "25.00",
          },
        ],
      },
    });

    const deposit = await makeDeposit(user._id, "500.00");

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(res.status).toBe(201);

    const tasks = await Task.find({ userId: user._id }).sort({
      orderNumber: 1,
    });
    expect(tasks).toHaveLength(6);

    for (const task of tasks.slice(0, 2)) {
      const price = parseFloat(task.price.toString());
      expect(price).toBeGreaterThanOrEqual(400);
      expect(price).toBeLessThanOrEqual(500);
    }

    const lucky = tasks[2];
    expect(lucky.isLuckyOrder).toBe(true);
    expect(parseFloat(lucky.commission.toString())).toBeCloseTo(25, 2);
    expect(lucky.productId.toString()).toBe(luckyProduct._id.toString());

    for (const task of tasks.slice(3)) {
      const price = parseFloat(task.price.toString());
      expect(price).toBeGreaterThanOrEqual(600);
      expect(price).toBeLessThanOrEqual(750);
    }

    const productIds = tasks.map((t) => t.productId.toString());
    expect(new Set(productIds).size).toBe(productIds.length);
  });

  it("keeps base unchanged for zero-deposit lucky positions", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts(range400to500);

    const luckyProduct = await Product.create({
      name: "Free lucky",
      price: "470.00",
    });

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 5,
      body: {
        luckyPositions: [
          {
            orderNumber: 2,
            productId: luckyProduct._id.toString(),
            requiredDeposit: "0.00",
            luckyCommission: "8.00",
          },
        ],
      },
    });

    const deposit = await makeDeposit(user._id, "500.00");

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(res.status).toBe(201);

    const tasks = await Task.find({ userId: user._id }).sort({
      orderNumber: 1,
    });

    for (const task of tasks) {
      const price = parseFloat(task.price.toString());
      expect(price).toBeGreaterThanOrEqual(400);
      expect(price).toBeLessThanOrEqual(500);
    }
  });

  it("rejects pending, foreign, or wrong-type deposit transactions", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const other = await createUser();
    await seedProducts(range400to500);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 3,
    });

    const pending = await makeDeposit(user._id, "500.00", "pending");
    const pendingRes = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: pending._id.toString() });
    expect(pendingRes.status).toBe(400);

    const foreign = await makeDeposit(other._id, "500.00");
    const foreignRes = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: foreign._id.toString() });
    expect(foreignRes.status).toBe(400);

    const withdraw = await Transaction.create({
      userId: user._id,
      type: "withdraw",
      amount: "100.00",
      status: "accepted",
    });
    const withdrawRes = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: withdraw._id.toString() });
    expect(withdrawRes.status).toBe(400);
  });

  it("rejects a deposit already used by another plan", async () => {
    const admin = await createUser("admin");
    const userA = await createUser();
    const userB = await createUser();
    await seedProducts(range400to500);

    const deposit = await makeDeposit(userB._id, "500.00");

    const planA = await createPlan(admin, userA._id.toString(), {
      totalOrders: 3,
    });
    const planB = await createPlan(admin, userB._id.toString(), {
      totalOrders: 3,
    });

    const first = await request(app)
      .post(`/api/orders/plans/${planB._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(first.status).toBe(201);

    // User A tries to reuse their own deposit? No — user A has no deposit;
    // simulate cross-plan reuse by attempting the same tx from plan A.
    const reuse = await request(app)
      .post(`/api/orders/plans/${planA._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(reuse.status).toBe(400);
  });

  it("rejects already generated plans and users with tasks", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts(range400to500);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 3,
    });
    const deposit = await makeDeposit(user._id, "500.00");

    const first = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(second.status).toBe(409);

    // Legacy tasks injected after plan creation block regeneration too.
    const user2 = await createUser();
    const plan2 = await createPlan(admin, user2._id.toString(), {
      totalOrders: 3,
    });
    await Task.create({
      userId: user2._id,
      orderNumber: 1,
      productName: "Injected",
      price: "100.00",
      commission: "1.00",
    });
    const deposit2 = await makeDeposit(user2._id, "500.00");
    const blocked = await request(app)
      .post(`/api/orders/plans/${plan2._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit2._id.toString() });
    expect(blocked.status).toBe(409);
  });

  it("enforces role access on generation", async () => {
    const admin = await createUser("admin");
    const foreignOwner = await createUser("owner");
    const user = await createUser("user", { ownerId: foreignOwner._id });
    await seedProducts(range400to500);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 3,
    });
    const deposit = await makeDeposit(user._id, "500.00");

    const plainUser = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(plainUser.status).toBe(403);

    const otherOwner = await createUser("owner");
    const asOtherOwner = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(otherOwner)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(asOtherOwner.status).toBe(403);

    const asOwner = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(foreignOwner)}`)
      .send({ depositTransactionId: deposit._id.toString() });
    expect(asOwner.status).toBe(201);
  });

  it("rejects when there are not enough products in range", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts([450, 460]);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 5,
    });
    const deposit = await makeDeposit(user._id, "500.00");

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(res.status).toBe(400);

    const tasks = await Task.countDocuments({ userId: user._id });
    expect(tasks).toBe(0);
  });

  it("rejects lucky products outside the segment range", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts(range400to500);

    const tooExpensive = await Product.create({
      name: "Too expensive lucky",
      price: "900.00",
    });

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 4,
      body: {
        luckyPositions: [
          {
            orderNumber: 2,
            productId: tooExpensive._id.toString(),
            requiredDeposit: "100.00",
            luckyCommission: "20.00",
          },
        ],
      },
    });
    const deposit = await makeDeposit(user._id, "500.00");

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(res.status).toBe(400);
  });

  it("never reuses a product and skips products above the bound", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts([450, 460, 470, 300, 800]);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 4,
    });
    const deposit = await makeDeposit(user._id, "500.00");

    const res = await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    expect(res.status).toBe(201);

    const tasks = await Task.find({ userId: user._id }).sort({
      orderNumber: 1,
    });
    expect(tasks).toHaveLength(4);

    const productIds = tasks.map((t) => t.productId.toString());
    expect(new Set(productIds).size).toBe(4);

    const prices = tasks.map((t) => parseFloat(t.price.toString()));
    expect(Math.max(...prices)).toBeLessThanOrEqual(500);
  });
});

describe("Plan deletion (DELETE /api/orders/plans/:id)", () => {
  it("admin can delete a draft plan", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 5,
    });

    const res = await request(app)
      .delete(`/api/orders/plans/${plan._id}`)
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(200);

    const found = await OrderPlan.findById(plan._id);
    expect(found).toBeNull();
  });

  it("cannot delete a generated plan", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await seedProducts(range400to500);

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 3,
    });
    const deposit = await makeDeposit(user._id, "500.00");

    await request(app)
      .post(`/api/orders/plans/${plan._id}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId: deposit._id.toString() });

    const res = await request(app)
      .delete(`/api/orders/plans/${plan._id}`)
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(409);
  });

  it("foreign owner cannot delete another owner's draft plan", async () => {
    const admin = await createUser("admin");
    const foreignOwner = await createUser("owner");
    const user = await createUser("user", { ownerId: foreignOwner._id });

    const plan = await createPlan(admin, user._id.toString(), {
      totalOrders: 5,
    });

    const otherOwner = await createUser("owner");
    const res = await request(app)
      .delete(`/api/orders/plans/${plan._id}`)
      .set("Authorization", `Bearer ${makeToken(otherOwner)}`);

    expect(res.status).toBe(403);
  });
});

describe("Plan-based completion (strict sequence)", () => {
  it("completes order 1 and credits the 0.5% commission", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const { planId } = await setupGeneratedPlan(admin, user, {
      totalOrders: 5,
    });

    const tasks = await planTasks(user._id);
    expect(tasks).toHaveLength(5);

    const res = await completeTask(user, tasks[0]._id);
    expect(res.status).toBe(200);

    const fresh = await Task.findById(tasks[0]._id);
    expect(fresh.status).toBe("completed");

    const userDoc = await User.findById(user._id);
    expect(parseFloat(userDoc.balance.toString())).toBeCloseTo(
      parseFloat(fresh.commission.toString()),
      2,
    );

    const plan = await OrderPlan.findById(planId);
    expect(plan.completedCount).toBe(1);
    expect(parseFloat(plan.currentBase.toString())).toBeCloseTo(500, 2);
    expect(plan.status).toBe("generated");

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:progress",
      expect.objectContaining({ planId, completedCount: 1, totalOrders: 5 }),
    );
  });

  it("enforces strict sequence across all actors", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const { planId } = await setupGeneratedPlan(admin, user, {
      totalOrders: 3,
    });

    const tasks = await planTasks(user._id);

    let res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/sequence/i);

    res = await completeTask(admin, tasks[1]._id);
    expect(res.status).toBe(409);

    res = await completeTask(user, tasks[0]._id);
    expect(res.status).toBe(200);

    res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(200);

    const plan = await OrderPlan.findById(planId);
    expect(plan.completedCount).toBe(2);
  });

  it("claims a new accepted deposit for a lucky order", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const luckyProduct = await createProduct("450.00", "Lucky");
    const { planId } = await setupGeneratedPlan(admin, user, {
      totalOrders: 3,
      luckyPositions: [
        {
          orderNumber: 2,
          productId: luckyProduct._id.toString(),
          requiredDeposit: "250.00",
          luckyCommission: "25.00",
        },
      ],
    });

    const tasks = await planTasks(user._id);

    expect((await completeTask(user, tasks[0]._id)).status).toBe(200);

    let res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/deposit/i);

    await makeDeposit(user._id, "100.00");
    res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(400);

    const luckyDeposit = await makeDeposit(user._id, "250.00");
    res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(200);

    const claimed = await Transaction.findById(luckyDeposit._id);
    expect(claimed.allocation).not.toBeNull();
    expect(claimed.allocation.taskId.toString()).toBe(tasks[1]._id.toString());

    const plan = await OrderPlan.findById(planId);
    expect(plan.completedCount).toBe(2);
    expect(parseFloat(plan.currentBase.toString())).toBeCloseTo(750, 2);

    const userDoc = await User.findById(user._id);
    const commission1 = parseFloat(tasks[0].commission.toString());
    expect(parseFloat(userDoc.balance.toString())).toBeCloseTo(
      commission1 + 25,
      2,
    );

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:progress",
      expect.objectContaining({ planId, completedCount: 2, totalOrders: 3 }),
    );
  });

  it("rejects the plan's initial deposit and completes with a fresh one", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const luckyProduct = await createProduct("450.00", "Lucky");
    const { planId, depositTx } = await setupGeneratedPlan(admin, user, {
      totalOrders: 2,
      deposit: "500.00",
      luckyPositions: [
        {
          orderNumber: 2,
          productId: luckyProduct._id.toString(),
          requiredDeposit: "500.00",
          luckyCommission: "10.00",
        },
      ],
    });

    const tasks = await planTasks(user._id);

    expect((await completeTask(user, tasks[0]._id)).status).toBe(200);

    let res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(400);

    await makeDeposit(user._id, "500.00");
    res = await completeTask(user, tasks[1]._id);
    expect(res.status).toBe(200);

    const initial = await Transaction.findById(depositTx._id);
    expect(initial.allocation).toBeNull();

    const plan = await OrderPlan.findById(planId);
    expect(plan.completedCount).toBe(2);
    expect(plan.status).toBe("completed");

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:plan_completed",
      expect.objectContaining({ planId, userId: user._id.toString() }),
    );
  });

  it("completes a zero-deposit lucky order without any deposit", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const luckyProduct = await createProduct("450.00", "Lucky");
    const { planId } = await setupGeneratedPlan(admin, user, {
      totalOrders: 3,
      luckyPositions: [
        {
          orderNumber: 2,
          productId: luckyProduct._id.toString(),
          requiredDeposit: "0.00",
          luckyCommission: "10.00",
        },
      ],
    });

    const tasks = await planTasks(user._id);

    expect((await completeTask(user, tasks[0]._id)).status).toBe(200);
    expect((await completeTask(user, tasks[1]._id)).status).toBe(200);

    const fresh = await Task.findById(tasks[1]._id);
    expect(fresh.status).toBe("completed");

    const plan = await OrderPlan.findById(planId);
    expect(plan.completedCount).toBe(2);
    expect(parseFloat(plan.currentBase.toString())).toBeCloseTo(500, 2);

    const userDoc = await User.findById(user._id);
    expect(parseFloat(userDoc.balance.toString())).toBeCloseTo(
      parseFloat(tasks[0].commission.toString()) + 10,
      2,
    );
  });

  it("cannot reuse an already allocated deposit", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const luckyProduct2 = await createProduct("450.00", "Lucky2");
    const luckyProduct4 = await createProduct("650.00", "Lucky4");
    const { planId } = await setupGeneratedPlan(admin, user, {
      totalOrders: 4,
      luckyPositions: [
        {
          orderNumber: 2,
          productId: luckyProduct2._id.toString(),
          requiredDeposit: "250.00",
          luckyCommission: "25.00",
        },
        {
          orderNumber: 4,
          productId: luckyProduct4._id.toString(),
          requiredDeposit: "250.00",
          luckyCommission: "30.00",
        },
      ],
    });

    const tasks = await planTasks(user._id);

    expect((await completeTask(user, tasks[0]._id)).status).toBe(200);

    await makeDeposit(user._id, "250.00");
    expect((await completeTask(user, tasks[1]._id)).status).toBe(200);
    expect((await completeTask(user, tasks[2]._id)).status).toBe(200);

    let res = await completeTask(user, tasks[3]._id);
    expect(res.status).toBe(400);

    await makeDeposit(user._id, "250.00");
    res = await completeTask(user, tasks[3]._id);
    expect(res.status).toBe(200);

    const plan = await OrderPlan.findById(planId);
    expect(plan.status).toBe("completed");
    expect(plan.completedCount).toBe(4);
  });
});

describe("Withdraw gate", () => {
  it("blocks withdrawals until the plan is fully completed", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    const { planId } = await setupGeneratedPlan(admin, user, {
      totalOrders: 3,
    });

    let res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ type: "deposit", amount: "10.00" });
    expect(res.status).toBe(201);

    await User.findByIdAndUpdate(user._id, {
      walletAddress: "TGateTestWalletAddress123",
    });

    res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({
        type: "withdraw",
        amount: "10.00",
        password: "password123",
      });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/plan/i);

    const tasks = await planTasks(user._id);
    for (const task of tasks) {
      expect((await completeTask(user, task._id)).status).toBe(200);
    }

    const plan = await OrderPlan.findById(planId);
    expect(plan.status).toBe("completed");

    res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({
        type: "withdraw",
        amount: "10.00",
        password: "password123",
      });
    expect(res.status).toBe(201);
  });

  it("blocks withdrawal with a draft plan and allows planless users", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    await createPlan(admin, user._id.toString(), { totalOrders: 5 });

    await User.findByIdAndUpdate(user._id, {
      walletAddress: "TDraftGateWalletAddress123",
    });

    let res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({
        type: "withdraw",
        amount: "10.00",
        password: "password123",
      });
    expect(res.status).toBe(409);

    const planless = await createUser();
    await User.findByIdAndUpdate(planless._id, {
      walletAddress: "TPlanlessWalletAddress123",
    });
    res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${makeToken(planless)}`)
      .send({
        type: "withdraw",
        amount: "10.00",
        password: "password123",
      });
    expect(res.status).toBe(201);
  });
});
