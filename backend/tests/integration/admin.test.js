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
const WalletLedger = require("../../src/models/WalletLedger");
const { toCents } = require("../../src/utils/money");

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

    it("lists most recent login first, never-signed-in last", async () => {
      const admin = await createUser("admin", {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      const stale = await createUser("user", {
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        lastLoginAt: new Date("2026-02-01T08:00:00.000Z"),
      });
      const fresh = await createUser("user", {
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        lastLoginAt: new Date("2026-10-20T08:00:00.000Z"),
      });
      const never = await createUser("user", {
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      });

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      // lastLoginAt descending first; the two never-signed-in rows then fall
      // back to createdAt descending, so the newer join outranks the older.
      expect(res.body.users.map((u) => u._id.toString())).toEqual([
        fresh._id.toString(),
        stale._id.toString(),
        never._id.toString(),
        admin._id.toString(),
      ]);
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

  describe("Presence (lastSeenAt)", () => {
    const MINUTE = 60_000;

    async function listAs(admin, query = "") {
      return request(app)
        .get(`/api/admin/users${query}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);
    }

    it("derives online from a recent stamp, not from the stored status", async () => {
      const admin = await createUser("admin");
      const active = await createUser("user", {
        status: "offline",
        lastSeenAt: new Date(Date.now() - MINUTE),
      });
      const idle = await createUser("user", {
        status: "online",
        lastSeenAt: new Date(Date.now() - 20 * MINUTE),
      });
      const never = await createUser("user");

      const res = await listAs(admin);

      expect(res.status).toBe(200);
      const byId = Object.fromEntries(
        res.body.users.map((u) => [u._id.toString(), u]),
      );
      expect(byId[active._id.toString()].online).toBe(true);
      expect(byId[idle._id.toString()].online).toBe(false);
      expect(byId[never._id.toString()].online).toBe(false);
      expect(byId[active._id.toString()].lastSeenAt).toBeTruthy();
    });

    it("filters status=online/offline by presence instead of the stored flag", async () => {
      // admin ရဲ့ stamp ကို ကိုယ်တိုင်မရေးတော့ဘူး — auth middleware ရဲ့ write က
      // fire-and-forget ဖြစ်လို့ list query နဲ့ ပြိုင်တယ်။ လက်မှတ်တင်ထားတဲ့
      // တန်ဖိုးကို အစောင့်ထည့်ပြီး presence filter ကိုပဲ စစ်တယ်။
      const admin = await createUser("admin", {
        lastSeenAt: new Date(Date.now() - MINUTE),
      });
      const active = await createUser("user", {
        status: "offline",
        lastSeenAt: new Date(Date.now() - MINUTE),
      });
      const stale = await createUser("user", {
        status: "online",
        lastSeenAt: new Date(Date.now() - 20 * MINUTE),
      });
      const never = await createUser("user");

      const online = await listAs(admin, "?status=online");
      const offline = await listAs(admin, "?status=offline");

      const onlineIds = online.body.users.map((u) => u._id.toString());
      // status field က "offline" ဖြစ်ပေမဲ့ stamp အသစ်ကြောင့် online စာရင်းဝင်မယ်။
      expect(onlineIds).toContain(active._id.toString());
      expect(onlineIds).not.toContain(stale._id.toString());
      expect(onlineIds).not.toContain(never._id.toString());
      expect(onlineIds).toContain(admin._id.toString());
      expect(offline.body.users.map((u) => u._id.toString())).toEqual(
        expect.arrayContaining([stale._id.toString(), never._id.toString()]),
      );
      expect(offline.body.total).toBe(2);
    });

    it("keeps burned accounts out of the presence filters", async () => {
      const admin = await createUser("admin");
      const burned = await createUser("user", {
        status: "burned",
        lastSeenAt: new Date(Date.now() - MINUTE),
      });

      const online = await listAs(admin, "?status=online");
      const burnedRes = await listAs(admin, "?status=burned");

      expect(online.body.users.map((u) => u._id.toString())).not.toContain(
        burned._id.toString(),
      );
      expect(burnedRes.body.users.map((u) => u._id.toString())).toEqual([
        burned._id.toString(),
      ]);
    });

    it("still scopes an owner's list when a status filter is applied", async () => {
      // owner ရဲ့ stamp ကို အစောင့်ထည့်တယ် — auth middleware ရဲ့ write က
      // fire-and-forget မို့ ဒီ list query နဲ့ ပြိုင်နေလို့။
      const owner = await createUser("owner", {
        lastSeenAt: new Date(Date.now() - MINUTE),
      });
      const mine = await createUser("user", {
        ownerId: owner._id,
        lastSeenAt: new Date(Date.now() - MINUTE),
      });
      const other = await createUser("user", {
        lastSeenAt: new Date(Date.now() - MINUTE),
      });

      const res = await listAs(owner, "?status=online");

      expect(res.status).toBe(200);
      const ids = res.body.users.map((u) => u._id.toString());
      expect(ids).toContain(mine._id.toString());
      expect(ids).toContain(owner._id.toString());
      // $or (downline scope) ကို status ရဲ့ $and clause က ဖုံးမသွားဘူး။
      expect(ids).not.toContain(other._id.toString());
    });

    it("stamps lastSeenAt on an authenticated request", async () => {
      const user = await createUser("user");

      await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      // The middleware fires the write without awaiting it.
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stamped = await User.findById(user._id).select("lastSeenAt");
      expect(stamped.lastSeenAt).toBeInstanceOf(Date);
      expect(Math.abs(Date.now() - stamped.lastSeenAt.getTime())).toBeLessThan(
        5 * MINUTE,
      );
    });

    it("leaves the stamp alone inside the throttle window", async () => {
      const seenAt = new Date(Date.now() - 5000);
      const user = await createUser("user", { lastSeenAt: seenAt });

      await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const kept = await User.findById(user._id).select("lastSeenAt");
      expect(kept.lastSeenAt.getTime()).toBe(seenAt.getTime());
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

  describe("Admin note (PATCH + GET /api/admin/users)", () => {
    it("admin stores a note and reads it back in the list", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ adminNote: "  deposit proof looks edited  " });

      expect(res.status).toBe(200);
      expect(res.body.user.adminNote).toBe("deposit proof looks edited");

      const list = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(
        list.body.users.find((row) => row._id === user._id.toString()).adminNote,
      ).toBe("deposit proof looks edited");
    });

    it("owner list response never carries the note", async () => {
      const admin = await createUser("admin");
      const owner = await createUser("owner");
      const downline = await createUser("user", { ownerId: owner._id });

      await request(app)
        .patch(`/api/admin/users/${downline._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ adminNote: "watch this account" });

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      for (const row of res.body.users) {
        expect(row).not.toHaveProperty("adminNote");
      }
    });

    it("admin clears a note with null", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user", { adminNote: "temporary" });

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ adminNote: null });

      expect(res.status).toBe(200);

      const stored = await User.findById(user._id).select("+adminNote");
      expect(stored.adminNote).toBeNull();
    });

    it("rejects a note longer than 500 characters", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user");

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ adminNote: "n".repeat(501) });

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

    it("rejects a proof screenshot that is not an ImageKit URL", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({
          type: "deposit",
          amount: "10.00",
          proofScreenshot: "data:image/png;base64,abc",
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

  describe("PUT /api/admin/users/:id/password", () => {
    it("replaces the hash and bumps tokenVersion", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");
      const oldHash = target.passwordHash;

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/password`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ password: "newpass456" });

      expect(res.status).toBe(200);

      const updated = await User.findById(target._id).select("+passwordHash");
      expect(updated.passwordHash).not.toBe(oldHash);
      expect(await bcrypt.compare("newpass456", updated.passwordHash)).toBe(
        true,
      );
      expect(await bcrypt.compare("password123", updated.passwordHash)).toBe(
        false,
      );
      expect(updated.tokenVersion).toBe(1);
    });

    it("signs the target out of the session issued before the reset", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");
      const issuedToken = makeToken(target);

      await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${issuedToken}`)
        .expect(200);

      await request(app)
        .put(`/api/admin/users/${target._id}/password`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ password: "newpass456" })
        .expect(200);

      const stale = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${issuedToken}`);

      expect(stale.status).toBe(401);
      expect(stale.body.message).toMatch(/session expired/i);

      const relogin = await request(app)
        .post("/api/auth/login")
        .send({ phone: target.phone, password: "newpass456" });

      expect(relogin.status).toBe(200);
      expect(relogin.body.user.id).toBe(target._id.toString());
    });

    it("refuses to reset another admin's password", async () => {
      const admin = await createUser("admin");
      const peer = await createUser("admin");

      const res = await request(app)
        .put(`/api/admin/users/${peer._id}/password`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ password: "newpass456" });

      expect(res.status).toBe(403);

      const untouched = await User.findById(peer._id).select("+passwordHash");
      expect(untouched.passwordHash).toBe(peer.passwordHash);
      expect(untouched.tokenVersion ?? 0).toBe(0);
    });

    it("owners cannot reset passwords", async () => {
      const owner = await createUser("owner");
      const target = await createUser("user", { ownerId: owner._id });

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/password`)
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ password: "newpass456" });

      expect(res.status).toBe(403);
    });

    it("rejects a password that trims below six characters", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/password`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ password: "  123  " });

      expect(res.status).toBe(400);

      const untouched = await User.findById(target._id).select("+passwordHash");
      expect(await bcrypt.compare("password123", untouched.passwordHash)).toBe(
        true,
      );
      expect(untouched.tokenVersion ?? 0).toBe(0);
    });
  });

  describe("PUT /api/admin/users/:id/wallet-address", () => {
    const TRON_ADDRESS = "TQSVhFzR7pN3yKdLmXcBv8tGnWqJs4Yp2r";

    it("sets the address for a user and for an owner", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");
      const owner = await createUser("owner");

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ walletAddress: `  ${TRON_ADDRESS} ` });

      expect(res.status).toBe(200);
      expect(res.body.walletAddress).toBe(TRON_ADDRESS);
      expect((await User.findById(target._id)).walletAddress).toBe(TRON_ADDRESS);

      const ownerRes = await request(app)
        .put(`/api/admin/users/${owner._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ walletAddress: TRON_ADDRESS });

      expect(ownerRes.status).toBe(200);
      expect((await User.findById(owner._id)).walletAddress).toBe(TRON_ADDRESS);
    });

    it("rejects an address that is not a TRON (TRC20) address", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", {
        walletAddress: "TOldAddressPlaceholderXXXX",
      });

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ walletAddress: "0xABCDEF0123456789abcdef0123456789abcdef" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/TRC20/);

      const untouched = await User.findById(target._id);
      expect(untouched.walletAddress).toBe("TOldAddressPlaceholderXXXX");
    });

    it("blocks the change while the target has a pending withdrawal", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", {
        walletAddress: "TOldAddressPlaceholderXXXX",
      });

      await Transaction.create({
        userId: target._id,
        type: "withdraw",
        amount: "15.00",
        status: "pending",
      });

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ walletAddress: TRON_ADDRESS });

      expect(res.status).toBe(409);

      const untouched = await User.findById(target._id);
      expect(untouched.walletAddress).toBe("TOldAddressPlaceholderXXXX");
    });

    it("lets the change through once the withdrawal is no longer pending", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");

      await Transaction.create({
        userId: target._id,
        type: "withdraw",
        amount: "15.00",
        status: "accepted",
      });

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ walletAddress: TRON_ADDRESS });

      expect(res.status).toBe(200);
    });

    it("refuses to change another admin's address", async () => {
      const admin = await createUser("admin");
      const peer = await createUser("admin", {
        walletAddress: "TPeerAdminWalletAddress000000000",
      });

      const res = await request(app)
        .put(`/api/admin/users/${peer._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ walletAddress: TRON_ADDRESS });

      expect(res.status).toBe(403);

      const untouched = await User.findById(peer._id);
      expect(untouched.walletAddress).toBe("TPeerAdminWalletAddress000000000");
    });

    it("owners cannot change downline addresses", async () => {
      const owner = await createUser("owner");
      const target = await createUser("user", { ownerId: owner._id });

      const res = await request(app)
        .put(`/api/admin/users/${target._id}/wallet-address`)
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ walletAddress: TRON_ADDRESS });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/admin/users/:id/balance", () => {
    it("credits the balance and writes a ledger row referencing the admin", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { balance: "10.00" });

      const res = await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ type: "credit", amount: "25.50", reason: "duplicate deposit" });

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe("35.50");

      const updated = await User.findById(target._id);
      expect(toCents(updated.balance.toString())).toBe(3550n);

      const ledger = await WalletLedger.find({ userId: target._id });
      expect(ledger).toHaveLength(1);
      expect(ledger[0].type).toBe("credit");
      expect(toCents(ledger[0].amount.toString())).toBe(2550n);
      expect(toCents(ledger[0].balance.toString())).toBe(3550n);
      expect(ledger[0].reference).toBe(admin._id.toString());
      expect(ledger[0].note).toBe("Admin adjustment: duplicate deposit");
    });

    it("keeps admin adjustments out of the commission note used for profit stats", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { balance: "10.00" });

      await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ type: "debit", amount: "4.00" });

      const ledger = await WalletLedger.findOne({ userId: target._id });
      expect(ledger.type).toBe("debit");
      expect(ledger.note).toBe("Admin adjustment");
      expect(toCents((await User.findById(target._id)).balance.toString())).toBe(
        600n,
      );
    });

    it("blocks a debit larger than the balance without touching money or ledger", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { balance: "10.00" });

      const res = await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ type: "debit", amount: "50.00" });

      expect(res.status).toBe(409);

      const after = await User.findById(target._id);
      expect(toCents(after.balance.toString())).toBe(1000n);
      expect(await WalletLedger.countDocuments({ userId: target._id })).toBe(0);
    });

    it("rejects a negative or zero amount", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { balance: "10.00" });

      const negative = await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ type: "credit", amount: "-5.00" });

      expect(negative.status).toBe(400);

      const zero = await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ type: "credit", amount: "0" });

      expect(zero.status).toBe(400);
      expect(toCents((await User.findById(target._id)).balance.toString())).toBe(
        1000n,
      );
    });

    it("owners cannot adjust balances", async () => {
      const owner = await createUser("owner");
      const target = await createUser("user", {
        ownerId: owner._id,
        balance: "10.00",
      });

      const res = await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ type: "credit", amount: "5.00" });

      expect(res.status).toBe(403);
    });

    it("refuses to adjust a burned account", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", {
        balance: "10.00",
        status: "burned",
      });

      const res = await request(app)
        .post(`/api/admin/users/${target._id}/balance`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ type: "credit", amount: "5.00" });

      expect(res.status).toBe(409);
    });
  });

  describe("Login device capture", () => {
    const CHROME_ON_WINDOWS =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    it("stores ip, login time and user agent on a successful login", async () => {
      await createUser("user", { phone: "0912345678" });

      const res = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", CHROME_ON_WINDOWS)
        .send({ phone: "0912345678", password: "password123" });

      expect(res.status).toBe(200);

      const saved = await User.findOne({ phone: "0912345678" });
      expect(saved.lastUserAgent).toBe(CHROME_ON_WINDOWS);
      expect(saved.lastLoginAt).toBeInstanceOf(Date);
      expect(saved.ipAddress).toBeTruthy();
    });

    it("leaves the previous device untouched when the password is wrong", async () => {
      const target = await createUser("user", {
        phone: "0912345679",
        ipAddress: "203.0.113.9",
        lastUserAgent: "older-session",
      });
      const previousLoginAt = target.lastLoginAt;

      const res = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", CHROME_ON_WINDOWS)
        .send({ phone: "0912345679", password: "wrong-password" });

      expect(res.status).toBe(401);

      const saved = await User.findOne({ phone: "0912345679" });
      expect(saved.lastUserAgent).toBe("older-session");
      expect(saved.ipAddress).toBe("203.0.113.9");
      expect(saved.lastLoginAt).toBe(previousLoginAt);
    });

    it("exposes a readable device label in the admin user list", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", {
        ipAddress: "203.0.113.42",
        lastUserAgent: CHROME_ON_WINDOWS,
      });

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);

      const row = res.body.users.find(
        (user) => user._id === target._id.toString(),
      );
      expect(row.ipAddress).toBe("203.0.113.42");
      expect(row.lastDevice).toBe("Chrome · Windows");
    });
  });
});
