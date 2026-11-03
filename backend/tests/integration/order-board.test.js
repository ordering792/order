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

let sequence = 0;

async function createUser(role = "user", extra = {}) {
  sequence += 1;
  const passwordHash = await bcrypt.hash("password123", 10);

  return User.create({
    name: `${role} user ${sequence}`,
    phone: `09${String(10000000 + sequence)}`,
    passwordHash,
    invitationCode: `CODE${String(100000 + sequence)}`,
    role,
    ...extra,
  });
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

function get(appInstance, url, actor) {
  return request(appInstance)
    .get(url)
    .set("Authorization", `Bearer ${makeToken(actor)}`);
}

async function makeDeposit(userId, amount, status = "accepted") {
  return Transaction.create({ userId, type: "deposit", amount, status });
}

async function seedProducts(prices) {
  return Product.insertMany(
    prices.map((price, index) => ({
      name: `P${index}-${price}`,
      price: price.toFixed(2),
    })),
  );
}

async function createPlan(admin, userId, totalOrders, luckyPositions = []) {
  const res = await request(app)
    .post("/api/orders/plans")
    .set("Authorization", `Bearer ${makeToken(admin)}`)
    .send({ userId, totalOrders, luckyPositions });

  expect(res.status).toBe(201);
  return res.body.plan;
}

// Balance round: အတည်ပြုပြီး deposit သက်သာ + balance > 0 ဖြစ်ရမယ်။
async function setupBalanceRound(admin, user, { totalOrders = 5, balance = "300.00" } = {}) {
  await makeDeposit(user._id, "500.00");
  await User.updateOne({ _id: user._id }, { $set: { balance } });
  await seedProducts([240, 250, 260, 270, 280, 290, 300]);

  const plan = await createPlan(admin, user._id.toString(), totalOrders);

  const res = await request(app)
    .post(`/api/orders/plans/${plan._id}/generate`)
    .set("Authorization", `Bearer ${makeToken(admin)}`)
    .send({});

  expect(res.status).toBe(201);

  return plan._id.toString();
}

describe("Order board (GET /api/admin/order-board)", () => {
  it("returns one row per end user with only the active plan", async () => {
    const admin = await createUser("admin");
    const plain = await createUser("user", { balance: "40.00" });
    const drafted = await createUser("user");
    await createUser("owner");
    await createUser("admin", { name: "Peer Admin" });
    await createPlan(admin, drafted._id.toString(), 12);

    const res = await get(app, "/api/admin/order-board", admin);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pages).toBe(1);

    const draftedRow = res.body.rows.find(
      (r) => r.user._id === drafted._id.toString(),
    );
    const plainRow = res.body.rows.find((r) => r.user._id === plain._id.toString());

    expect(draftedRow.plan.totalOrders).toBe(12);
    expect(draftedRow.plan.status).toBe("draft");
    expect(draftedRow.plan.completedCount).toBe(0);
    expect(plainRow.plan).toBeNull();
    expect(plainRow.user.balance).toBeDefined();
    expect(plainRow.user.invitationCode).toBe(plain.invitationCode);
    expect(plainRow.user).not.toHaveProperty("passwordHash");
  });

  it("drops a completed round so the card can open the next one", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const plan = await createPlan(admin, user._id.toString(), 5);

    await OrderPlan.updateOne(
      { _id: plan._id },
      { $set: { status: "completed" } },
    );

    const res = await get(app, "/api/admin/order-board", admin);

    expect(res.status).toBe(200);
    expect(res.body.rows[0].plan).toBeNull();
  });

  it("searches by name, phone and invitation code", async () => {
    const admin = await createUser("admin");
    const ko = await createUser("user", {
      name: "Ko Search",
      phone: "0988776655",
      invitationCode: "ZZ4455",
    });
    await createUser("user", { name: "Other Person" });

    for (const term of ["Ko Search", "0988776655", "zz4455"]) {
      const res = await get(
        app,
        `/api/admin/order-board?search=${encodeURIComponent(term)}`,
        admin,
      );

      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].user._id).toBe(ko._id.toString());
    }
  });

  it("escapes regex characters in the search term", async () => {
    const admin = await createUser("admin");
    await createUser("user", { name: "a.b" });
    await createUser("user", { name: "axb" });

    const res = await get(app, "/api/admin/order-board?search=a.b", admin);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].user.name).toBe("a.b");
  });

  it("paginates with an explicit limit", async () => {
    const admin = await createUser("admin");
    for (let i = 0; i < 3; i += 1) {
      await createUser("user");
    }

    const res = await get(app, "/api/admin/order-board?page=2&limit=2", admin);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.pages).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.rows).toHaveLength(1);
  });

  it("scopes an owner to their own downline", async () => {
    const admin = await createUser("admin");
    const owner = await createUser("owner");
    const mine = await createUser("user", { ownerId: owner._id });
    const foreign = await createUser("user");
    const unowned = await createUser("user");
    await createPlan(admin, mine._id.toString(), 8);

    const res = await get(app, "/api/admin/order-board", owner);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].user._id).toBe(mine._id.toString());
    expect(res.body.rows[0].plan.totalOrders).toBe(8);
    expect(
      res.body.rows.some(
        (r) =>
          r.user._id === foreign._id.toString() ||
          r.user._id === unowned._id.toString(),
      ),
    ).toBe(false);
  });

  it("refuses the board to an end user", async () => {
    const user = await createUser("user");

    const res = await get(app, "/api/admin/order-board", user);

    expect(res.status).toBe(403);
  });
});

describe("Draft plan update (PATCH /api/orders/plans/:id)", () => {
  function patch(planId, actor, body) {
    return request(app)
      .patch(`/api/orders/plans/${planId}`)
      .set("Authorization", `Bearer ${makeToken(actor)}`)
      .send(body);
  }

  it("rewrites the count and the lucky tags of a draft", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const plan = await createPlan(admin, user._id.toString(), 10);

    const res = await patch(plan._id.toString(), admin, {
      totalOrders: 20,
      luckyPositions: [
        {
          orderNumber: 4,
          productId: null,
          requiredDeposit: "150.00",
          luckyCommission: "7.50",
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.plan.totalOrders).toBe(20);
    expect(res.body.plan.luckyPositions).toHaveLength(1);
    expect(
      parseFloat(res.body.plan.luckyPositions[0].requiredDeposit.toString()),
    ).toBeCloseTo(150, 2);

    const saved = await OrderPlan.findById(plan._id);
    expect(saved.totalOrders).toBe(20);

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:plan_updated",
      expect.objectContaining({ totalOrders: 20 }),
    );
  });

  it("clears every lucky tag when the list is empty", async () => {
    const admin = await createUser("admin");
    const product = await seedProducts([250]);
    const user = await createUser("user");
    const plan = await createPlan(admin, user._id.toString(), 10, [
      {
        orderNumber: 3,
        productId: product[0]._id.toString(),
        requiredDeposit: "0.00",
        luckyCommission: "5.00",
      },
    ]);

    const res = await patch(plan._id.toString(), admin, {
      totalOrders: 10,
      luckyPositions: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.plan.luckyPositions).toHaveLength(0);
  });

  it("refuses to edit a plan whose orders already exist", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const planId = await setupBalanceRound(admin, user);

    const res = await patch(planId, admin, {
      totalOrders: 9,
      luckyPositions: [],
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/draft/i);
  });

  it("keeps the create-time validation rules", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const plan = await createPlan(admin, user._id.toString(), 10);
    const planId = plan._id.toString();

    const beyondRound = await patch(planId, admin, {
      totalOrders: 3,
      luckyPositions: [
        {
          orderNumber: 8,
          requiredDeposit: "0.00",
          luckyCommission: "1.00",
        },
      ],
    });
    expect(beyondRound.status).toBe(400);

    const duplicated = await patch(planId, admin, {
      totalOrders: 10,
      luckyPositions: [
        { orderNumber: 2, requiredDeposit: "0.00", luckyCommission: "1.00" },
        { orderNumber: 2, requiredDeposit: "0.00", luckyCommission: "2.00" },
      ],
    });
    expect(duplicated.status).toBe(400);

    const badCount = await patch(planId, admin, {
      totalOrders: 900,
      luckyPositions: [],
    });
    expect(badCount.status).toBe(400);

    const stillDraft = await OrderPlan.findById(plan._id);
    expect(stillDraft.totalOrders).toBe(10);
  });

  it("enforces the same roles as plan creation", async () => {
    const admin = await createUser("admin");
    const owner = await createUser("owner");
    const user = await createUser("user");
    const foreign = await createUser("user");
    const plan = await createPlan(admin, foreign._id.toString(), 10);

    const asUser = await patch(plan._id.toString(), user, {
      totalOrders: 11,
      luckyPositions: [],
    });
    expect(asUser.status).toBe(403);

    const asForeignOwner = await patch(plan._id.toString(), owner, {
      totalOrders: 11,
      luckyPositions: [],
    });
    expect(asForeignOwner.status).toBe(403);

    const mine = await createUser("user", { ownerId: owner._id });
    const myPlan = await createPlan(admin, mine._id.toString(), 10);
    const asOwnOwner = await patch(myPlan._id.toString(), owner, {
      totalOrders: 11,
      luckyPositions: [],
    });
    expect(asOwnOwner.status).toBe(200);
  });
});

describe("Mid-round lucky order (POST /api/orders/plans/:id/lucky-positions)", () => {
  function addLucky(planId, actor, body) {
    return request(app)
      .post(`/api/orders/plans/${planId}/lucky-positions`)
      .set("Authorization", `Bearer ${makeToken(actor)}`)
      .send(body);
  }

  async function tasksOf(userId) {
    const rows = await Task.find({ userId }).sort({ orderNumber: 1 });
    return rows.map((task) => ({
      orderNumber: task.orderNumber,
      productId: task.productId?.toString() ?? null,
      price: parseFloat(task.price.toString()),
      commission: parseFloat(task.commission.toString()),
      isLuckyOrder: task.isLuckyOrder,
    }));
  }

  it("re-prices only the chosen order and leaves the rest of the round alone", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    const before = await tasksOf(user._id);

    const res = await addLucky(planId, admin, {
      orderNumber: 3,
      requiredDeposit: "0.00",
      luckyCommission: "12.00",
    });

    expect(res.status).toBe(201);
    expect(res.body.plan.luckyPositions).toHaveLength(1);

    const after = await tasksOf(user._id);
    expect(after).toHaveLength(5);

    // Option A: မိတ်ဆက် order တစ်ခုတည်း ပြင်တယ် — နောက်ကျန် order တွေ မလှုပ်ဘူး။
    for (const orderNumber of [1, 2, 4, 5]) {
      expect(after[orderNumber - 1]).toEqual(before[orderNumber - 1]);
    }

    const changed = after[2];
    expect(changed.isLuckyOrder).toBe(true);
    expect(changed.commission).toBeCloseTo(12, 2);
    expect(changed.price).toBeGreaterThanOrEqual(240);
    expect(changed.price).toBeLessThanOrEqual(300);

    // Round တစ်ခုမှာ product တစ်ခု ထပ်မပေါ် shouldn't — မိတ်ဆက် order ရဲ့
    // product ကိုပဲ ပြန်ရွေးရွေး တစ်ခါတည်း ဖြစ်ရမယ်။
    const duplicates = await Task.countDocuments({
      userId: user._id,
      productId: new mongoose.Types.ObjectId(changed.productId),
    });
    expect(duplicates).toBe(1);

    const lucky = await Task.findOne({
      userId: user._id,
      orderNumber: 3,
    });
    expect(lucky.status).toBe("available");

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:lucky_added",
      expect.objectContaining({ orderNumber: 3 }),
    );
  });

  it("widens the price band with the deposits of earlier lucky orders", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    const first = await addLucky(planId, admin, {
      orderNumber: 1,
      requiredDeposit: "200.00",
      luckyCommission: "5.00",
    });
    expect(first.status).toBe(201);

    await seedProducts([400, 420, 450, 480, 500]);

    const res = await addLucky(planId, admin, {
      orderNumber: 4,
      requiredDeposit: "0.00",
      luckyCommission: "9.00",
    });
    expect(res.status).toBe(201);

    const lucky = await Task.findOne({
      userId: user._id,
      orderNumber: 4,
    });

    // base 300 + 200 (order 1) = 500 → band 400..500
    const price = parseFloat(lucky.price.toString());
    expect(price).toBeGreaterThanOrEqual(400);
    expect(price).toBeLessThanOrEqual(500);

    const saved = await OrderPlan.findById(planId);
    expect(saved.luckyPositions).toHaveLength(2);
    expect(parseFloat(saved.currentBase.toString())).toBeCloseTo(300, 2);
  });

  it("accepts an explicit product only inside the band and unused in this round", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    // ယာယီ order တစ်ခုရဲ့ product ကို နောက် order မှာ ထပ်သုံးလို့ မရဘူး။
    const otherOrderProduct = await Task.findOne({
      userId: user._id,
      orderNumber: 1,
    }).then((task) => task.productId.toString());

    const reused = await addLucky(planId, admin, {
      orderNumber: 2,
      productId: otherOrderProduct,
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });
    expect(reused.status).toBe(409);

    const own = await addLucky(planId, admin, {
      orderNumber: 2,
      productId: (await Task.findOne({ userId: user._id, orderNumber: 2 })).productId.toString(),
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });
    expect(own.status).toBe(201);

    const tooCheap = await seedProducts([10]);
    const outside = await addLucky(planId, admin, {
      orderNumber: 5,
      productId: tooCheap[0]._id.toString(),
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });
    expect(outside.status).toBe(400);

    const inBand = await seedProducts([260]);
    const ok = await addLucky(planId, admin, {
      orderNumber: 5,
      productId: inBand[0]._id.toString(),
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });
    expect(ok.status).toBe(201);

    const lucky = await Task.findOne({ userId: user._id, orderNumber: 5 });
    expect(lucky.productId.toString()).toBe(inBand[0]._id.toString());
    expect(lucky.productName).toBe(inBand[0].name);
  });

  it("refuses positions on orders the user already started", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    await Task.updateOne(
      { userId: user._id, orderNumber: 2 },
      { $set: { status: "assigned" } },
    );

    const inProgress = await addLucky(planId, admin, {
      orderNumber: 2,
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });
    expect(inProgress.status).toBe(409);
    expect(inProgress.body.message).toMatch(/in progress/i);

    const beyond = await addLucky(planId, admin, {
      orderNumber: 99,
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });
    expect(beyond.status).toBe(400);

    const stillClean = await Task.countDocuments({
      userId: user._id,
      isLuckyOrder: true,
    });
    expect(stillClean).toBe(0);
  });

  it("only adds to a generated round, never to a draft", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const plan = await createPlan(admin, user._id.toString(), 5);

    const res = await addLucky(plan._id.toString(), admin, {
      orderNumber: 2,
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/generated/i);
  });

  it("keeps end users out of the lucky injection", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    const res = await addLucky(planId, user, {
      orderNumber: 1,
      requiredDeposit: "0.00",
      luckyCommission: "3.00",
    });

    expect(res.status).toBe(403);

    const saved = await OrderPlan.findById(planId);
    expect(saved.luckyPositions).toHaveLength(0);
  });
});

describe("Removing a mid-round lucky order (DELETE /api/orders/plans/:id/lucky-positions/:orderNumber)", () => {
  function removeLucky(planId, actor, orderNumber) {
    return request(app)
      .delete(`/api/orders/plans/${planId}/lucky-positions/${orderNumber}`)
      .set("Authorization", `Bearer ${makeToken(actor)}`);
  }

  function addLucky(planId, actor, body) {
    return request(app)
      .post(`/api/orders/plans/${planId}/lucky-positions`)
      .set("Authorization", `Bearer ${makeToken(actor)}`)
      .send(body);
  }

  async function tasksOf(userId) {
    const rows = await Task.find({ userId }).sort({ orderNumber: 1 });
    return rows.map((task) => ({
      orderNumber: task.orderNumber,
      productId: task.productId?.toString() ?? null,
      productName: task.productName,
      price: parseFloat(task.price.toString()),
      commission: parseFloat(task.commission.toString()),
      isLuckyOrder: task.isLuckyOrder,
    }));
  }

  // 0.50% commission, half-up — written independently of orderSelection.js
  function plainCommission(price) {
    const priceCents = BigInt(Math.round(price * 100));
    return Number((5n * priceCents + 500n) / 1000n) / 100;
  }

  it("turns the lucky order back into a plain one and leaves the round alone", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    const added = await addLucky(planId, admin, {
      orderNumber: 3,
      requiredDeposit: "250.00",
      luckyCommission: "12.00",
    });
    expect(added.status).toBe(201);

    const lucky = await tasksOf(user._id);
    expect(lucky[2].isLuckyOrder).toBe(true);
    expect(lucky[2].commission).toBeCloseTo(12, 2);

    const res = await removeLucky(planId, admin, 3);
    expect(res.status).toBe(200);
    expect(res.body.plan.luckyPositions).toHaveLength(0);

    const after = await tasksOf(user._id);
    expect(after).toHaveLength(5);

    // product/price ကို မထိဘူး — tag နဲ့ commission ပဲ ပြောင်းတယ်။
    expect(after[2].productId).toBe(lucky[2].productId);
    expect(after[2].price).toBeCloseTo(lucky[2].price, 2);
    expect(after[2].isLuckyOrder).toBe(false);
    expect(after[2].commission).toBeCloseTo(plainCommission(after[2].price), 2);

    for (const orderNumber of [1, 2, 4, 5]) {
      expect(after[orderNumber - 1]).toEqual(lucky[orderNumber - 1]);
    }

    const saved = await OrderPlan.findById(planId);
    expect(parseFloat(saved.currentBase.toString())).toBeCloseTo(300, 2);
    expect(saved.completedCount).toBe(0);

    expect(emitToAdmins).toHaveBeenCalledWith(
      "order:lucky_removed",
      expect.objectContaining({ orderNumber: 3 }),
    );
  });

  it("refuses to remove a tag on an order the user already grabbed", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    await addLucky(planId, admin, {
      orderNumber: 2,
      requiredDeposit: "100.00",
      luckyCommission: "8.00",
    });

    await Task.updateOne(
      { userId: user._id, orderNumber: 2 },
      { $set: { status: "assigned", assignedAt: new Date() } },
    );

    const res = await removeLucky(planId, admin, 2);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/in progress/i);

    const saved = await OrderPlan.findById(planId);
    expect(saved.luckyPositions).toHaveLength(1);

    const task = await Task.findOne({ userId: user._id, orderNumber: 2 });
    expect(task.isLuckyOrder).toBe(true);
    expect(parseFloat(task.commission.toString())).toBeCloseTo(8, 2);
  });

  it("only removes from a generated round, never from a draft", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const plan = await createPlan(admin, user._id.toString(), 5, [
      { orderNumber: 2, requiredDeposit: "0.00", luckyCommission: "3.00" },
    ]);

    const res = await removeLucky(plan._id.toString(), admin, 2);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/generated/i);

    const saved = await OrderPlan.findById(plan._id);
    expect(saved.luckyPositions).toHaveLength(1);
  });

  it("says so when the order carries no lucky tag", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", { balance: "300.00" });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 5 });

    const notLucky = await removeLucky(planId, admin, 1);
    expect(notLucky.status).toBe(404);
    expect(notLucky.body.message).toMatch(/not a lucky order/i);

    const badNumber = await request(app)
      .delete(`/api/orders/plans/${planId}/lucky-positions/0`)
      .set("Authorization", `Bearer ${makeToken(admin)}`);
    expect(badNumber.status).toBe(400);

    const asUser = await removeLucky(planId, user, 1);
    expect(asUser.status).toBe(403);
  });

  it("pays the plain commission and claims no deposit once the tag is gone", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user", {
      balance: "300.00",
      licenseAcceptedAt: new Date(),
    });
    const planId = await setupBalanceRound(admin, user, { totalOrders: 2 });

    await addLucky(planId, admin, {
      orderNumber: 1,
      requiredDeposit: "250.00",
      luckyCommission: "50.00",
    });
    expect((await removeLucky(planId, admin, 1)).status).toBe(200);

    const matched = await request(app)
      .post("/api/tasks/match")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({});
    expect(matched.status).toBe(200);
    expect(matched.body.needsDeposit).toBe(false);
    expect(matched.body.order.isLuckyOrder).toBe(false);

    // Order ကျပြီးမှ တင်တဲ့ deposit — tag ရှိနေရင် ဒီပိုက်ဆံကို claim လုပ်မယ်။
    const tx = await makeDeposit(user._id, "250.00");

    const task = await Task.findOne({ userId: user._id, orderNumber: 1 });
    const completed = await request(app)
      .post(`/api/tasks/complete/${task._id}`)
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({});
    expect(completed.status).toBe(200);

    const price = parseFloat(task.price.toString());
    const funded = await User.findById(user._id);
    expect(parseFloat(funded.balance.toString())).toBeCloseTo(
      300 + plainCommission(price),
      2,
    );

    const spent = await Transaction.findById(tx._id);
    expect(parseFloat(spent.appliedAmount.toString())).toBe(0);
    expect(spent.allocation).toBeNull();

    const saved = await OrderPlan.findById(planId);
    expect(parseFloat(saved.currentBase.toString())).toBeCloseTo(300, 2);
    expect(saved.completedCount).toBe(1);
  });
});
