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

describe("Transaction endpoints", () => {
  describe("POST /api/transactions", () => {
    it("creates a deposit transaction", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "deposit",
          amount: "500.00",
          proofScreenshot: "https://ik.imagekit.io/testid/deposit-proofs/screenshot.png",
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe("deposit");
      expect(res.body.transaction.status).toBe("pending");
    });

    it("creates a withdraw transaction", async () => {
      const user = await createUser();
      await User.findByIdAndUpdate(user._id, {
        walletAddress: "TUserWalletAddress123",
      });
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "withdraw",
          amount: "200.00",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe("withdraw");
    });

    it("rejects a withdraw without a password", async () => {
      const user = await createUser();
      await User.findByIdAndUpdate(user._id, {
        walletAddress: "TUserWalletAddress123",
      });
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "withdraw",
          amount: "200.00",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/password/i);
    });

    it("rejects a withdraw with an incorrect password", async () => {
      const user = await createUser();
      await User.findByIdAndUpdate(user._id, {
        walletAddress: "TUserWalletAddress123",
      });
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "withdraw",
          amount: "200.00",
          password: "wrongpassword",
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/incorrect/i);
    });

    it("rejects a withdraw with a blank password", async () => {
      const user = await createUser();
      await User.findByIdAndUpdate(user._id, {
        walletAddress: "TUserWalletAddress123",
      });
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "withdraw",
          amount: "200.00",
          password: "   ",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/password/i);
    });

    it("does not require a password for deposits", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "deposit",
          amount: "500.00",
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe("deposit");
    });

    it("rejects a withdraw without a wallet address", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "withdraw",
          amount: "200.00",
          password: "password123",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/wallet/i);
    });

    it("rejects invalid type", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "invalid",
          amount: "100",
        });

      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/transactions")
        .send({ type: "deposit", amount: "100" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/transactions", () => {
    it("lists user transactions", async () => {
      const user = await createUser();
      await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "100.00",
      });

      const token = makeToken(user);

      const res = await request(app)
        .get("/api/transactions")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
    });
  });

  describe("GET /api/transactions/admin", () => {
    it("lists all transactions for admin", async () => {
      const admin = await createUser("admin");
      const user1 = await createUser();
      const user2 = await createUser();

      await Transaction.create([
        { userId: user1._id, type: "deposit", amount: "100.00" },
        { userId: user2._id, type: "withdraw", amount: "200.00" },
      ]);

      const token = makeToken(admin);

      const res = await request(app)
        .get("/api/transactions/admin")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(2);
    });

    it("filters by status", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      await Transaction.create([
        { userId: user._id, type: "deposit", amount: "100.00" },
        {
          userId: user._id,
          type: "withdraw",
          amount: "200.00",
          status: "accepted",
        },
      ]);

      const token = makeToken(admin);

      const res = await request(app)
        .get("/api/transactions/admin?status=accepted")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].status).toBe("accepted");
    });

    it("rejects non-admin users", async () => {
      const user = await createUser("user");
      const token = makeToken(user);

      const res = await request(app)
        .get("/api/transactions/admin")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("includes the user wallet address for review", async () => {
      const admin = await createUser("admin");
      const user = await createUser();
      await User.findByIdAndUpdate(user._id, {
        walletAddress: "TReviewWalletAddress999",
      });

      await Transaction.create({
        userId: user._id,
        type: "withdraw",
        amount: "200.00",
      });

      const res = await request(app)
        .get("/api/transactions/admin")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions[0].userId.walletAddress).toBe(
        "TReviewWalletAddress999",
      );
    });
  });

  describe("GET /api/transactions/admin/deposits", () => {
    it("returns the accepted deposit of a requested user", async () => {
      const admin = await createUser("admin");
      const user = await createUser("user", { balance: "120.00" });

      await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
        status: "accepted",
      });

      const res = await request(app)
        .get(`/api/transactions/admin/deposits?userIds=${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.deposits).toHaveLength(1);
      expect(res.body.deposits[0].userId).toBe(user._id.toString());
      expect(res.body.deposits[0].accepted.amount).toBe("500.00");
      expect(res.body.deposits[0].freeAccepted._id).toBeDefined();
      expect(res.body.deposits[0].balance).toBe("120.00");
    });

    it("finds deposits that are older than the newest 100 transactions", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
        status: "accepted",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      });

      // 120 ခုက အသစ် transaction တွေ — adminList က နောက်ဆုံး ၁၀၀ ခုပဲ ပြန်ရတယ်။
      const noise = Array.from({ length: 120 }, (_, index) => ({
        userId: user._id,
        type: "withdraw",
        amount: "10.00",
        status: "accepted",
      }));
      await Transaction.create(noise);

      const res = await request(app)
        .get(`/api/transactions/admin/deposits?userIds=${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.deposits[0].accepted.amount).toBe("500.00");
    });

    it("marks a deposit that a plan already used as not free", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const deposit = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
        status: "accepted",
      });

      await OrderPlan.create({
        userId: user._id,
        totalOrders: 10,
        status: "generated",
        initialDeposit: "500.00",
        initialDepositTxId: deposit._id,
      });

      const res = await request(app)
        .get(`/api/transactions/admin/deposits?userIds=${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.deposits[0].accepted._id).toBe(deposit._id.toString());
      expect(res.body.deposits[0].freeAccepted).toBeNull();
    });

    it("lists pending deposits separately", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "250.00",
        status: "pending",
      });

      const res = await request(app)
        .get(`/api/transactions/admin/deposits?userIds=${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.deposits[0].accepted).toBeNull();
      expect(res.body.deposits[0].pending).toHaveLength(1);
      expect(res.body.deposits[0].pending[0].amount).toBe("250.00");
    });

    it("returns empty values for a user without deposits", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const res = await request(app)
        .get(`/api/transactions/admin/deposits?userIds=${user._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.deposits[0].accepted).toBeNull();
      expect(res.body.deposits[0].freeAccepted).toBeNull();
      expect(res.body.deposits[0].pending).toHaveLength(0);
    });

    it("rejects plain users", async () => {
      const user = await createUser();

      const res = await request(app)
        .get(`/api/transactions/admin/deposits?userIds=${user._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(403);
    });

    it("keeps an owner inside their own downline", async () => {
      const owner = await createUser("owner");
      const downline = await createUser("user", {
        ownerId: owner._id,
        balance: "77.00",
      });
      const foreign = await createUser("user", { balance: "55.00" });

      await Transaction.create([
        {
          userId: downline._id,
          type: "deposit",
          amount: "500.00",
          status: "accepted",
        },
        {
          userId: foreign._id,
          type: "deposit",
          amount: "900.00",
          status: "accepted",
        },
      ]);

      const res = await request(app)
        .get(
          `/api/transactions/admin/deposits?userIds=${downline._id},${foreign._id}`,
        )
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);

      const mine = res.body.deposits.find(
        (item) => item.userId === downline._id.toString(),
      );
      const other = res.body.deposits.find(
        (item) => item.userId === foreign._id.toString(),
      );

      expect(mine.accepted.amount).toBe("500.00");
      expect(mine.balance).toBe("77.00");
      expect(other.accepted).toBeNull();
      expect(other.balance).toBe("0.00");
    });
  });

  describe("POST /api/transactions/admin/:id/accept", () => {
    it("accepts a pending transaction", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const token = makeToken(admin);

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/accept`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.transaction.status).toBe("accepted");
      expect(res.body.transaction.reviewedBy).toBeDefined();
    });

    it("rejects already processed transactions", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
        status: "accepted",
      });

      const token = makeToken(admin);

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/accept`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
    });

    it("emits balance update to admins when a deposit is accepted", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/accept`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);

      expect(emitToAdmins).toHaveBeenCalledWith(
        "balance:updated",
        expect.objectContaining({
          userId: user._id.toString(),
          reason: "transaction_accepted",
        }),
      );
      expect(emitToAdmins).toHaveBeenCalledWith(
        "transaction:updated",
        expect.objectContaining({
          transactionId: transaction._id.toString(),
          status: "accepted",
        }),
      );
    });
  });

  describe("POST /api/transactions/admin/:id/reject", () => {
    it("rejects a pending transaction with reason", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const transaction = await Transaction.create({
        userId: user._id,
        type: "withdraw",
        amount: "200.00",
      });

      const token = makeToken(admin);

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/reject`)
        .set("Authorization", `Bearer ${token}`)
        .send({ rejectionReason: "Invalid proof" });

      expect(res.status).toBe(200);
      expect(res.body.transaction.status).toBe("rejected");
      expect(res.body.transaction.rejectionReason).toBe("Invalid proof");
    });

    it("requires a rejection reason", async () => {
      const admin = await createUser("admin");
      const user = await createUser();

      const transaction = await Transaction.create({
        userId: user._id,
        type: "withdraw",
        amount: "200.00",
      });

      const token = makeToken(admin);

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/reject`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("Owner deposit review (owner scoping)", () => {
    it("owner accepts a deposit from their own user", async () => {
      const owner = await createUser("owner");
      const user = await createUser("user", { ownerId: owner._id });

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/accept`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(200);
      expect(res.body.transaction.status).toBe("accepted");
    });

    it("owner rejects a deposit from their own user", async () => {
      const owner = await createUser("owner");
      const user = await createUser("user", { ownerId: owner._id });

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/reject`)
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ rejectionReason: "Screenshot is not clear" });

      expect(res.status).toBe(200);
      expect(res.body.transaction.status).toBe("rejected");
      expect(res.body.transaction.rejectionReason).toBe(
        "Screenshot is not clear",
      );
    });

    it("owner cannot accept a deposit from a foreign user", async () => {
      const owner = await createUser("owner");
      const otherOwner = await createUser("owner");
      const user = await createUser("user", { ownerId: otherOwner._id });

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/accept`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(403);
    });

    it("owner cannot reject a deposit from a foreign user", async () => {
      const owner = await createUser("owner");
      const otherOwner = await createUser("owner");
      const user = await createUser("user", { ownerId: otherOwner._id });

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/reject`)
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ rejectionReason: "Invalid proof" });

      expect(res.status).toBe(403);
    });

    it("plain user cannot accept deposits", async () => {
      const user = await createUser();

      const transaction = await Transaction.create({
        userId: user._id,
        type: "deposit",
        amount: "500.00",
      });

      const res = await request(app)
        .post(`/api/transactions/admin/${transaction._id}/accept`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Crypto address (USDT TRC20)", () => {
    it("owner updates their own crypto address", async () => {
      const owner = await createUser("owner");

      const res = await request(app)
        .put("/api/auth/owner/crypto-address")
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({ cryptoAddress: "TTrc20ExampleAddress123456789" });

      expect(res.status).toBe(200);

      const fresh = await User.findById(owner._id);
      expect(fresh.cryptoAddress).toBe("TTrc20ExampleAddress123456789");
    });

    it("rejects an invalid crypto address payload", async () => {
      const owner = await createUser("owner");

      const res = await request(app)
        .put("/api/auth/owner/crypto-address")
        .set("Authorization", `Bearer ${makeToken(owner)}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("plain user cannot set a crypto address", async () => {
      const user = await createUser();

      const res = await request(app)
        .put("/api/auth/owner/crypto-address")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({ cryptoAddress: "TTrc20ExampleAddress123456789" });

      expect(res.status).toBe(403);
    });

    it("user sees their owner crypto address on deposit info", async () => {
      const owner = await createUser("owner");
      await User.findByIdAndUpdate(owner._id, {
        cryptoAddress: "TOWNER123TRC20",
      });
      const user = await createUser("user", { ownerId: owner._id });

      const res = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.cryptoAddress).toBe("TOWNER123TRC20");
    });

    it("user without an owner gets a null crypto address", async () => {
      const user = await createUser();

      const res = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.cryptoAddress).toBeNull();
    });

    it("users under different owners see different addresses", async () => {
      const owner1 = await createUser("owner");
      const owner2 = await createUser("owner");
      await User.findByIdAndUpdate(owner1._id, { cryptoAddress: "TAAA111" });
      await User.findByIdAndUpdate(owner2._id, { cryptoAddress: "TBBB222" });
      const user1 = await createUser("user", { ownerId: owner1._id });
      const user2 = await createUser("user", { ownerId: owner2._id });

      const res1 = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user1)}`);
      const res2 = await request(app)
        .get("/api/auth/deposit-info")
        .set("Authorization", `Bearer ${makeToken(user2)}`);

      expect(res1.body.cryptoAddress).toBe("TAAA111");
      expect(res2.body.cryptoAddress).toBe("TBBB222");
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/auth/deposit-info");

      expect(res.status).toBe(401);
    });
  });

  describe("Wallet address (user TRC20)", () => {
    it("user updates their own wallet address", async () => {
      const user = await createUser();

      const res = await request(app)
        .put("/api/auth/wallet-address")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({ walletAddress: "TMyOwnWalletAddress123" });

      expect(res.status).toBe(200);

      const fresh = await User.findById(user._id);
      expect(fresh.walletAddress).toBe("TMyOwnWalletAddress123");
    });

    it("rejects an invalid wallet address payload", async () => {
      const user = await createUser();

      const res = await request(app)
        .put("/api/auth/wallet-address")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .put("/api/auth/wallet-address")
        .send({ walletAddress: "TMyOwnWalletAddress123" });

      expect(res.status).toBe(401);
    });
  });
});
