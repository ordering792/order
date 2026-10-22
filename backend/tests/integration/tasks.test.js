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
const WalletLedger = require("../../src/models/WalletLedger");
const LuckyOrderConfig = require("../../src/models/LuckyOrderConfig");

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

describe("Task endpoints", () => {
  describe("GET /api/tasks/my-tasks", () => {
    it("returns tasks for authenticated user", async () => {
      const user = await createUser();
      await Task.create({
        userId: user._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Test Product",
        price: "100.00",
        commission: "10.00",
      });

      const token = makeToken(user);

      const res = await request(app)
        .get("/api/tasks/my-tasks")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].productName).toBe("Test Product");
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/tasks/my-tasks");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/tasks/generate", () => {
    it("creates 40 tasks for admin", async () => {
      const admin = await createUser("admin");
      const targetUser = await createUser();

      const tasks = Array.from({ length: 40 }, (_, i) => ({
        orderNumber: i + 1,
        productName: `Product ${i + 1}`,
        price: "50.00",
        commission: "5.00",
        isLuckyOrder: false,
      }));

      const token = makeToken(admin);

      const res = await request(app)
        .post("/api/tasks/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ userId: targetUser._id.toString(), tasks });

      expect(res.status).toBe(201);

      const count = await Task.countDocuments({ userId: targetUser._id });
      expect(count).toBe(40);
    });

    it("rejects non-admin users", async () => {
      const user = await createUser("user");
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/tasks/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ userId: user._id.toString(), tasks: [] });

      expect(res.status).toBe(403);
    });

    it("rejects invalid task count", async () => {
      const admin = await createUser("admin");
      const targetUser = await createUser();

      const token = makeToken(admin);

      const res = await request(app)
        .post("/api/tasks/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          userId: targetUser._id.toString(),
          tasks: [{ orderNumber: 1 }],
        });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/tasks/complete/:id", () => {
    it("completes a task and credits commission", async () => {
      const admin = await createUser("admin");
      const targetUser = await createUser();

      const task = await Task.create({
        userId: targetUser._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Complete me",
        price: "100.00",
        commission: "15.00",
      });

      const token = makeToken(admin);

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);

      const updated = await Task.findById(task._id);
      expect(updated.status).toBe("completed");

      const user = await User.findById(targetUser._id);
      expect(parseFloat(user.balance.toString())).toBeCloseTo(15, 2);
    });

    it("requires admin role", async () => {
      const user = await createUser("user");
      const targetUser = await createUser();

      const task = await Task.create({
        userId: targetUser._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Test",
        price: "50.00",
        commission: "5.00",
      });

      const token = makeToken(user);

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("user completes their own task and receives commission", async () => {
      const user = await createUser();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Self complete",
        price: "100.00",
        commission: "12.50",
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);

      const updated = await Task.findById(task._id);
      expect(updated.status).toBe("completed");

      const fresh = await User.findById(user._id);
      expect(parseFloat(fresh.balance.toString())).toBeCloseTo(12.5, 2);

      const ledger = await WalletLedger.find({ userId: user._id });
      expect(ledger).toHaveLength(1);
      expect(ledger[0].type).toBe("credit");
      expect(parseFloat(ledger[0].amount.toString())).toBeCloseTo(12.5, 2);
    });

    it("owner can complete tasks of their own users", async () => {
      const owner = await createUser("owner");
      const user = await createUser();
      user.ownerId = owner._id;
      await user.save();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Owner completes",
        price: "50.00",
        commission: "5.00",
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);

      const updated = await Task.findById(task._id);
      expect(updated.status).toBe("completed");
    });

    it("emits real-time task and balance updates to admins", async () => {
      const user = await createUser();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Realtime",
        price: "100.00",
        commission: "10.00",
      });

      await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(emitToAdmins).toHaveBeenCalledWith(
        "task:completed",
        expect.objectContaining({
          taskId: task._id.toString(),
          userId: user._id.toString(),
          orderNumber: 1,
        }),
      );
      expect(emitToAdmins).toHaveBeenCalledWith(
        "balance:updated",
        expect.objectContaining({
          userId: user._id.toString(),
          reason: "task_completed",
        }),
      );
    });
  });

  describe("Lucky order deposit", () => {
    it("charges required deposit and credits commission", async () => {
      const user = await createUser();
      user.balance = "100.00";
      await user.save();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 3,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Lucky product",
        price: "200.00",
        commission: "15.00",
        isLuckyOrder: true,
      });

      await LuckyOrderConfig.create({
        userId: user._id,
        orderNumber: 3,
        requiredDeposit: "5.00",
        extraCommission: "0.00",
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);

      const fresh = await User.findById(user._id);
      // 100 - 5 deposit + 15 commission = 110
      expect(parseFloat(fresh.balance.toString())).toBeCloseTo(110, 2);

      const ledger = await WalletLedger.find({ userId: user._id }).sort({
        createdAt: 1,
      });
      expect(ledger).toHaveLength(2);
      expect(ledger[0].type).toBe("debit");
      expect(parseFloat(ledger[0].amount.toString())).toBeCloseTo(5, 2);
      expect(ledger[1].type).toBe("credit");
    });

    it("returns 409 when lucky config is missing", async () => {
      const user = await createUser();
      user.balance = "100.00";
      await user.save();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 4,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Lucky no config",
        price: "200.00",
        commission: "15.00",
        isLuckyOrder: true,
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(409);

      const updated = await Task.findById(task._id);
      expect(updated.status).toBe("assigned");
    });

    it("returns 400 when balance is insufficient for deposit", async () => {
      const user = await createUser();
      user.balance = "3.00";
      await user.save();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 5,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Lucky poor",
        price: "200.00",
        commission: "15.00",
        isLuckyOrder: true,
      });

      await LuckyOrderConfig.create({
        userId: user._id,
        orderNumber: 5,
        requiredDeposit: "5.00",
        extraCommission: "0.00",
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(400);

      const updated = await Task.findById(task._id);
      expect(updated.status).toBe("assigned");

      const fresh = await User.findById(user._id);
      expect(parseFloat(fresh.balance.toString())).toBeCloseTo(3, 2);
    });
  });

  describe("Referral bonus", () => {
    it("credits referral bonus to referrer when referred user completes a task", async () => {
      const referrer = await createUser();
      const user = await createUser();
      user.referredByCode = referrer.invitationCode;
      await user.save();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Referred task",
        price: "100.00",
        commission: "20.00",
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);

      const freshReferrer = await User.findById(referrer._id);
      // REFERRAL_BONUS_PERCENT default 10% of 20.00 = 2.00
      expect(parseFloat(freshReferrer.balance.toString())).toBeCloseTo(2, 2);

      const referrerLedger = await WalletLedger.find({
        userId: referrer._id,
      });
      expect(referrerLedger).toHaveLength(1);
      expect(referrerLedger[0].type).toBe("credit");
      expect(referrerLedger[0].note).toBe("Referral bonus");

      expect(emitToAdmins).toHaveBeenCalledWith(
        "balance:updated",
        expect.objectContaining({
          userId: referrer._id.toString(),
          reason: "referral_bonus",
        }),
      );
    });

    it("pays no bonus for master code registration", async () => {
      const masterCode = process.env.DEFAULT_INVITATION_CODE || "MASTER2024";
      const user = await createUser();
      user.referredByCode = masterCode;
      await user.save();

      const task = await Task.create({
        userId: user._id,
        orderNumber: 1,
        status: "assigned",
        assignedAt: new Date(),
        productName: "Master task",
        price: "100.00",
        commission: "20.00",
      });

      const res = await request(app)
        .post(`/api/tasks/complete/${task._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);

      const ledger = await WalletLedger.find({ userId: user._id });
      expect(ledger).toHaveLength(1);
      expect(ledger[0].note).not.toBe("Referral bonus");
    });
  });
});
