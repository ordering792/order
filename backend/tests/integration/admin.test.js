const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

jest.mock("../../src/socket", () => ({
  setupSocket: jest.fn(),
  getIO: jest.fn(),
  emitToConversation: jest.fn(),
  emitToAdmins: jest.fn(),
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
const WalletLedger = require("../../src/models/WalletLedger");

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

describe("Admin & owner endpoints", () => {
  describe("Login normalisation", () => {
    it("logs in when the phone has stray spaces or dashes", async () => {
      const admin = await createUser("admin", { phone: "09112223334" });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ phone: " 0911-222-3334 ", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(admin._id.toString());
      expect(res.body.user.role).toBe("admin");
    });

    it("logs in when the password has surrounding spaces", async () => {
      await createUser("admin", { phone: "09112223335" });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ phone: "09112223335", password: " password123 " });

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/admin/users", () => {
    it("admin can list all users", async () => {
      const admin = await createUser("admin");
      await createUser("user");

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(2);
      expect(res.body.total).toBe(2);
    });

    it("admin can search users by phone", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { phone: "09123456789" });
      await createUser("user");

      const res = await request(app)
        .get("/api/admin/users?search=09123456789")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0]._id).toBe(target._id.toString());
    });

    it("regular user cannot list users", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(403);
    });

    it("owner only sees their own downline users", async () => {
      const owner = await createUser("owner");
      const mine = await createUser("user", { ownerId: owner._id });
      const other = await createUser("user");

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.users.map((u) => u._id)).toContain(mine._id.toString());
      expect(res.body.users.map((u) => u._id)).toContain(owner._id.toString());
      expect(res.body.users.map((u) => u._id)).not.toContain(other._id.toString());
    });

    it("owner search still matches their own record", async () => {
      const owner = await createUser("owner");

      const res = await request(app)
        .get(`/api/admin/users?search=${owner.phone}`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0]._id).toBe(owner._id.toString());
    });
  });

  describe("PATCH /api/admin/users/:id", () => {
    it("admin can change a user role", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ role: "owner" });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("owner");

      const updated = await User.findById(user._id);
      expect(updated.role).toBe("owner");
    });

    it("admin can burn a user", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ status: "burned" });

      expect(res.status).toBe(200);

      const updated = await User.findById(user._id);
      expect(updated.status).toBe("burned");
    });

    it("owner cannot change user roles", async () => {
      const owner = await createUser("owner");
      const user = await createUser("user");

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ role: "owner" });

      expect(res.status).toBe(403);
    });

    it("admin cannot demote itself", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .patch(`/api/admin/users/${admin._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ role: "user" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/admin/stats", () => {
    it("returns platform counters for admin", async () => {
      const admin = await createUser("admin");
      await createUser("user");
      await createUser("owner");
      await Product.create({ name: "P", price: "10.00" });

      const res = await request(app)
        .get("/api/admin/stats")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.stats.totalUsers).toBe(3);
      expect(res.body.stats.totalOwners).toBe(1);
      expect(res.body.stats.totalProducts).toBe(1);
    });

    it("owner stats only count their own users", async () => {
      const owner = await createUser("owner");
      await createUser("user", { ownerId: owner._id });
      await createUser("user");

      const res = await request(app)
        .get("/api/admin/stats")
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);
      expect(res.body.stats.totalUsers).toBe(1);
    });

    it("regular user cannot read stats", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .get("/api/admin/stats")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Owner scoping", () => {
    it("owner only sees transactions of their own users", async () => {
      const owner = await createUser("owner");
      const mine = await createUser("user", { ownerId: owner._id });
      const other = await createUser("user");

      await Transaction.create({
        userId: mine._id,
        type: "deposit",
        amount: "100.00",
        status: "pending",
      });
      await Transaction.create({
        userId: other._id,
        type: "deposit",
        amount: "250.00",
        status: "pending",
      });

      const res = await request(app)
        .get("/api/transactions/admin")
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].amount.$numberDecimal).toBe("100.00");
    });

    it("admin sees all transactions", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "100.00",
        status: "pending",
      });

      const res = await request(app)
        .get("/api/transactions/admin")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
    });
  });

  describe("Deposit address resolution", () => {
    it("uses the owner's address when the owner has set one", async () => {
      const admin = await createUser("admin", {
        cryptoAddress: "ADMINWALLET000000000000000000001",
        cryptoQrUrl: "https://example.com/admin-qr.png",
      });
      const owner = await createUser("owner", {
        cryptoAddress: "OWNERWALLET000000000000000000001",
        cryptoQrUrl: "https://example.com/owner-qr.png",
      });
      const user = await createUser("user", { ownerId: owner._id });

      const res = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.cryptoAddress).toBe("OWNERWALLET000000000000000000001");
      expect(res.body.qrUrl).toBe("https://example.com/owner-qr.png");
      expect(res.body.source).toBe("owner");
      expect(res.body.payTo).toBe(owner.name);
      expect(admin).not.toBeNull();
    });

    it("falls back to the admin address when the owner has none", async () => {
      await createUser("admin", {
        cryptoAddress: "ADMINWALLET000000000000000000001",
        cryptoQrUrl: "https://example.com/admin-qr.png",
      });
      const owner = await createUser("owner", { cryptoAddress: null });
      const user = await createUser("user", { ownerId: owner._id });

      const res = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.cryptoAddress).toBe("ADMINWALLET000000000000000000001");
      expect(res.body.source).toBe("admin");
    });

    it("returns null when nobody has configured an address", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.cryptoAddress).toBeNull();
      expect(res.body.source).toBeNull();
    });

    it("owner and admin can set their own address and QR", async () => {
      const owner = await createUser("owner");

      const res = await request(app)
        .put("/api/auth/owner/crypto-address")
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({
          cryptoAddress: "OWNERWALLET000000000000000000002",
          qrUrl: "https://example.com/owner2.png",
        });

      expect(res.status).toBe(200);

      const updated = await User.findById(owner._id);
      expect(updated.cryptoAddress).toBe("OWNERWALLET000000000000000000002");
      expect(updated.cryptoQrUrl).toBe("https://example.com/owner2.png");
    });

    it("regular user cannot set a crypto address", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .put("/api/auth/owner/crypto-address")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({ cryptoAddress: "HACKEDWALLET00000000000000000001" });

      expect(res.status).toBe(403);
    });

    it("admin can set an owner's address and QR", async () => {
      const admin = await createUser("admin");
      const owner = await createUser("owner");

      const res = await request(app)
        .patch(`/api/admin/users/${owner._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({
          cryptoAddress: "OWNERWALLET000000000000000000003",
          cryptoQrUrl: "https://example.com/owner3.png",
        });

      expect(res.status).toBe(200);

      const updated = await User.findById(owner._id);
      expect(updated.cryptoAddress).toBe("OWNERWALLET000000000000000000003");
      expect(updated.cryptoQrUrl).toBe("https://example.com/owner3.png");
    });
  });

  describe("GET /api/auth/profits", () => {
    it("sums the user's task commission into total/today/yesterday", async () => {
      const user = await createUser("user");

      await WalletLedger.create([
        {
          userId: user._id,
          type: "credit",
          amount: "4.02",
          balance: "4.02",
          note: "Task commission",
        },
        {
          userId: user._id,
          type: "credit",
          amount: "1.50",
          balance: "5.52",
          note: "Referral bonus",
        },
      ]);

      const res = await request(app)
        .get("/api/auth/profits")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.profits.total)).toBeCloseTo(4.02, 2);
      expect(parseFloat(res.body.profits.today)).toBeCloseTo(4.02, 2);
      expect(parseFloat(res.body.profits.yesterday)).toBeCloseTo(0, 2);
      expect(parseFloat(res.body.profits.team)).toBeCloseTo(1.5, 2);    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/auth/profits");
      expect(res.status).toBe(401);
    });
  });

  describe("Transaction review safety", () => {
    it("credits the balance only once when two accepts race", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      const tx = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
        status: "pending",
      });

      const accept = () =>
        request(app)
          .post(`/api/transactions/admin/${tx._id}/accept`)
          .set("Authorization", `Bearer ${makeToken(admin)}`)
          .send({});

      const [first, second] = await Promise.all([accept(), accept()]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const updated = await User.findById(user._id);
      expect(parseFloat(updated.balance.toString())).toBeCloseTo(500, 2);
    });

    it("rejects an already processed transaction", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      const tx = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "100.00",
        status: "pending",
      });

      const first = await request(app)
        .post(`/api/transactions/admin/${tx._id}/accept`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({});
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/api/transactions/admin/${tx._id}/accept`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({});
      expect(second.status).toBe(409);

      const updated = await User.findById(user._id);
      expect(parseFloat(updated.balance.toString())).toBeCloseTo(100, 2);
    });

    it("rejects an oversized proof screenshot", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({
          type: "deposit",
          amount: "10.00",
          proofScreenshot: "x".repeat(2_000_001),
        });

      expect(res.status).toBe(400);
    });
    it("protects the last active admin from being demoted or burned", async () => {
      const admin = await createUser("admin");

      const demote = await request(app)
        .patch(`/api/admin/users/${admin._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ role: "user" });

      expect(demote.status).toBe(400);

      const burn = await request(app)
        .patch(`/api/admin/users/${admin._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ status: "burned" });

      expect(burn.status).toBe(400);
    });

    it("allows demoting an admin when another one exists", async () => {
      const admin = await createUser("admin");
      const other = await createUser("admin");

      const res = await request(app)
        .patch(`/api/admin/users/${other._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ role: "user" });

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/tasks/user/:userId", () => {
    it("admin can list a user's tasks", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      await Task.create({
        userId: user._id,
        orderNumber: 1,
        productName: "Item A",
        price: "50.00",
        commission: "0.25",
        isLuckyOrder: false,
      });

      const res = await request(app)
        .get(`/api/tasks/user/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].productName).toBe("Item A");
    });

    it("owner can only list their own users' tasks", async () => {
      const owner = await createUser("owner");
      const mine = await createUser("user", { ownerId: owner._id });
      const other = await createUser("user");

      await Task.create({
        userId: other._id,
        orderNumber: 1,
        productName: "Not Mine",
        price: "50.00",
        commission: "0.25",
      });

      const res = await request(app)
        .get(`/api/tasks/user/${other._id}`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(403);

      const okRes = await request(app)
        .get(`/api/tasks/user/${mine._id}`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(okRes.status).toBe(200);
      expect(okRes.body.tasks).toHaveLength(0);
    });

    it("regular user cannot list another user's tasks", async () => {
      const user = await createUser("user");
      const other = await createUser("user");

      const res = await request(app)
        .get(`/api/tasks/user/${other._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/products/bulk", () => {
    it("admin can bulk import products", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .post("/api/products/bulk")
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({
          products: [
            {
              name: "Bulk A",
              code: "B0001",
              category: "Electronics",
              usage: "Plug in",
              price: "25.00",
            },
            {
              name: "Bulk B",
              code: "B0002",
              category: "Office",
              usage: "Place on desk",
              price: "35.00",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(2);

      const saved = await Product.find({ code: { $in: ["B0001", "B0002"] } });
      expect(saved).toHaveLength(2);
      expect(saved[0].category).toBe("Electronics");
    });

    it("rejects bulk import with invalid price", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .post("/api/products/bulk")
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({
          products: [{ name: "Bad", price: "99999.00" }],
        });

      expect(res.status).toBe(400);
    });

    it("non-admin cannot bulk import", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .post("/api/products/bulk")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({ products: [{ name: "X", price: "10.00" }] });

      expect(res.status).toBe(403);
    });
  });
});
