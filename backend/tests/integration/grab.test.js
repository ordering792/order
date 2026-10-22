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
const Transaction = require("../../src/models/Transaction");
const OrderPlan = require("../../src/models/OrderPlan");

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
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

async function createUser(role = "user") {
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
  });
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function seedPlan(
  user,
  { luckyPositions = [], totalOrders = 5, productCount = 5 } = {},
) {
  const baseProducts = [
    { name: "Item A", price: "450.00", code: "P001", category: "Office" },
    { name: "Item B", price: "470.00", code: "P002", category: "Office" },
    { name: "Item C", price: "430.00", code: "P003", category: "Office" },
    { name: "Item D", price: "410.00", code: "P004", category: "Office" },
    { name: "Item E", price: "490.00", code: "P005", category: "Office" },
  ];

  const extraProducts = Array.from(
    { length: Math.max(0, productCount - baseProducts.length) },
    (_, i) => ({
      name: `Item ${i + 6}`,
      price: `${(405 + i * 5).toFixed(2)}`,
      code: `P${String(i + 6).padStart(3, "0")}`,
      category: "Office",
    }),
  );

  await Product.insertMany([...baseProducts, ...extraProducts]);

  const plan = await OrderPlan.create({
    userId: user._id,
    totalOrders,
    status: "draft",
    completedCount: 0,
    luckyPositions: luckyPositions.map((position) => ({
      ...position,
      requiredDeposit: position.requiredDeposit ?? "0.00",
      luckyCommission: position.luckyCommission ?? "5.00",
    })),
  });

  const products = await Product.find().sort({ price: 1 });

  await Task.insertMany(
    products.slice(0, totalOrders).map((product, index) => ({
      userId: user._id,
      orderPlanId: plan._id,
      orderNumber: index + 1,
      productName: product.name,
      productId: product._id,
      imageUrl: product.imageUrl ?? null,
      code: product.code,
      category: product.category,
      usage: product.usage ?? "",
      description: product.description ?? "",
      price: product.price,
      commission: "2.50",
      isLuckyOrder: false,
      status: "available",
    })),
  );

  plan.status = "generated";
  await plan.save();

  return plan;
}

describe("Grab / matching flow", () => {
  // helper တွေ — admin/owner API တွေကို ခေါ်သုံးပါ
  const apiCreatePlan = async (admin, user, totalOrders) => {
    const res = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders });
    return res.body.plan;
  };

  const apiDeposit = async (user, amount) => {
    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ type: "deposit", amount, proofScreenshot: "data:image/png;base64,iVBORw0KGgo=" });
    return res.body.transaction;
  };

  const apiAccept = async (admin, transactionId) => {
    await request(app)
      .post(`/api/transactions/admin/${transactionId}/accept`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({});
    return transactionId;
  };

  const apiGenerate = async (admin, planId, depositTransactionId) =>
    request(app)
      .post(`/api/orders/plans/${planId}/generate`)
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ depositTransactionId });

  const apiSummary = async (user) => {
    const res = await request(app)
      .get("/api/tasks/summary")
      .set("Authorization", `Bearer ${makeToken(user)}`);
    return res.body.summary;
  };

  // price range 800-1000 ထဲက product တွေ (deposit 1000 အတွက် — ၈၀%-၁၀%)
  const apiSeedProducts = async (count) => {
    await Product.insertMany(
      Array.from({ length: count }, (_, i) => ({
        name: `Bulk Item ${i + 1}`,
        price: `${(805 + i * 4).toFixed(2)}`,
        code: `B${String(i + 1).padStart(3, "0")}`,
        category: "Office",
      })),
    );
  };

  it("summary starts with zero counts and the plan total", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const res = await request(app)
      .get("/api/tasks/summary")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalOrderNumber).toBe(5);
    expect(res.body.summary.completedCount).toBe(0);
    expect(res.body.summary.undoneCount).toBe(0);
    expect(res.body.summary.remainingCount).toBe(5);
    expect(res.body.summary.balance).toBe("0.00");
  });

  it("match assigns the next order and returns the order detail", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const res = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.order.orderNumber).toBe(1);
    expect(res.body.order.productName).toBeTruthy();
    expect(res.body.order.price).toBeTruthy();
    expect(res.body.order.totalAmount).toBeTruthy();
    expect(res.body.order.isLuckyOrder).toBe(false);
    expect(res.body.needsDeposit).toBe(false);

    const task = await Task.findOne({ userId: user._id });
    expect(task.status).toBe("assigned");
    expect(task.assignedAt).not.toBeNull();
  });

  it("match is idempotent while an order is assigned", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const first = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);
    const second = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(second.status).toBe(200);
    expect(second.body.order.id).toBe(first.body.order.id);
  });

  it("submit stores rating + feedback and keeps the order assigned", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const matched = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    const res = await request(app)
      .post(`/api/tasks/${matched.body.order.id}/submit`)
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ rating: 5, feedback: "Great product" });

    expect(res.status).toBe(200);

    const task = await Task.findById(matched.body.order.id);
    expect(task.status).toBe("assigned");
    expect(task.submittedAt).not.toBeNull();
    expect(task.rating).toBe(5);
    expect(task.feedback).toBe("Great product");
  });

  it("completing a submitted order credits the commission and updates counters", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const matched = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    await request(app)
      .post(`/api/tasks/${matched.body.order.id}/submit`)
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ rating: 4 });

    const completed = await request(app)
      .post(`/api/tasks/complete/${matched.body.order.id}`)
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({});

    expect(completed.status).toBe(200);

    const summary = await request(app)
      .get("/api/tasks/summary")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(summary.body.summary.completedCount).toBe(1);
    expect(summary.body.summary.undoneCount).toBe(0);
    expect(summary.body.summary.remainingCount).toBe(4);
    expect(parseFloat(summary.body.summary.totalCommission)).toBeCloseTo(2.5, 2);
  });

  it("orders list only returns assigned + completed orders", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const before = await request(app)
      .get("/api/tasks/orders")
      .set("Authorization", `Bearer ${makeToken(user)}`);
    expect(before.body.tasks).toHaveLength(0);

    await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    const after = await request(app)
      .get("/api/tasks/orders")
      .set("Authorization", `Bearer ${makeToken(user)}`);
    expect(after.body.tasks).toHaveLength(1);
    expect(after.body.tasks[0].status).toBe("assigned");
  });

  it("lucky order reports the missing deposit amount", async () => {
    const user = await createUser();
    const plan = await seedPlan(user, { totalOrders: 5 });

    const luckyProduct = await Product.findOne();
    await Task.updateOne(
      { userId: user._id, orderNumber: 1 },
      {
        $set: {
          isLuckyOrder: true,
          commission: "5.00",
        },
      },
    );

    plan.luckyPositions = [
      {
        orderNumber: 1,
        productId: luckyProduct._id,
        requiredDeposit: "100.00",
        luckyCommission: "5.00",
      },
    ];
    await plan.save();

    const res = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.order.isLuckyOrder).toBe(true);
    expect(res.body.order.requireDeposit).toBe("100.00");
    expect(res.body.needsDeposit).toBe(true);
    expect(res.body.shortBy).toBe("100.00");
  });

  it("matches legacy tasks that still have the old 'pending' status", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    // အချိန်ကျေး status ပြောင်းမှီး ဖန်တီးထားတဲ့ task တွေ
    await Task.updateMany(
      { userId: user._id },
      { $set: { status: "pending" } },
    );

    const res = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.order.orderNumber).toBe(1);

    const summary = await request(app)
      .get("/api/tasks/summary")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(summary.body.summary.remainingCount).toBe(4);
    expect(summary.body.summary.undoneCount).toBe(1);
  });

  it("creates as many orders as the admin asked for", async () => {
    const admin = await createUser("admin");
    const user = await createUser();

    await apiSeedProducts(25);

    for (const totalOrders of [10, 20, 7]) {
      const planUser = await createUser();
      const plan = await apiCreatePlan(admin, planUser, totalOrders);
      const deposit = await apiDeposit(planUser, "1000.00");
      const accepted = await apiAccept(admin, deposit._id);

      const gen = await apiGenerate(admin, plan._id, accepted);
      expect(gen.status).toBe(201);

      const tasks = await Task.find({ userId: planUser._id });
      expect(tasks).toHaveLength(totalOrders);

      const summary = await apiSummary(planUser);
      expect(summary.totalOrderNumber).toBe(totalOrders);
      expect(summary.remainingCount).toBe(totalOrders);
    }  });

  it("allows a new plan once the previous one is completed", async () => {
    const admin = await createUser("admin");
    const user = await createUser();
    await apiSeedProducts(10);

    // round 1
    const plan1 = await apiCreatePlan(admin, user, 3);
    const deposit1 = await apiDeposit(user, "1000.00");
    const accepted1 = await apiAccept(admin, deposit1._id);
    const gen1 = await apiGenerate(admin, plan1._id, accepted1);
    expect(gen1.status).toBe(201);

    // a second plan is blocked while round 1 is still open
    const blocked = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 3 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/already has an order plan/i);

    // complete every order of round 1
    for (let orderNumber = 1; orderNumber <= 3; orderNumber += 1) {
      const task = await Task.findOne({ userId: user._id, orderNumber });
      await request(app)
        .post(`/api/tasks/match`)
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({});
      await request(app)
        .post(`/api/tasks/${task._id}/submit`)
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({});
      const done = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({});
      expect(done.status).toBe(200);
    }

    const finished = await OrderPlan.findById(plan1._id);
    expect(finished.status).toBe("completed");

    // round 2 is allowed now
    const plan2 = await request(app)
      .post("/api/orders/plans")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ userId: user._id.toString(), totalOrders: 3 });
    expect(plan2.status).toBe(201);

    // the old tasks stay, the new plan has none yet
    expect(await Task.countDocuments({ userId: user._id })).toBe(3);
  });

  it("cannot match without a plan", async () => {
    const user = await createUser();

    const res = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(404);
  });

  it("cannot complete an order that was never matched", async () => {
    const user = await createUser();
    await seedPlan(user, { totalOrders: 5 });

    const task = await Task.findOne({ userId: user._id });

    const res = await request(app)
      .post(`/api/tasks/complete/${task._id}`)
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({});

    expect(res.status).toBe(409);
  });
});
