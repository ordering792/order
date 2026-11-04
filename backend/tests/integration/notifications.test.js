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
const Announcement = require("../../src/models/Annoncement");
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
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

async function createUser(role = "user", extra = {}) {
  const passwordHash = await bcrypt.hash("password123", 10);

  return User.create({
    name: `${role} one`,
    phone: `09${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`,
    passwordHash,
    invitationCode: `A${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    role,
    ...extra,
  });
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

function unread(token) {
  return request(app)
    .get("/api/notifications/unread")
    .set("Authorization", `Bearer ${token}`);
}

function markSeen(token) {
  return request(app)
    .post("/api/notifications/seen")
    .set("Authorization", `Bearer ${token}`)
    .send();
}

const announce = (body) => Announcement.create(body);

// createdAt က millisecond resolution — seen stamp နဲ့ တစ်ချိန်တည်း ဖြစ်သွားရင်
// $gt က လွတ်သွားလို့ အသစ်ထည့်ခါနီး အနည်းဆုံး ၅ ms ချထားတယ်။
const later = () => new Promise((resolve) => setTimeout(resolve, 5));

const tx = (userId, type = "deposit", extra = {}) =>
  Transaction.create({
    userId,
    type,
    amount: "50.00",
    status: "pending",
    ...extra,
  });

describe("GET /api/notifications/unread", () => {
  it("requires a signed-in account", async () => {
    const res = await request(app).get("/api/notifications/unread");

    expect(res.status).toBe(401);
  });

  it("counts a broadcast announcement as one unread", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");

    await announce({
      userId: admin._id,
      recipientId: null,
      title: "Maintenance",
      content: "Tonight",
    });

    const res = await unread(makeToken(user));

    expect(res.body.count).toBe(1);
  });

  it("counts own deposit and withdraw requests", async () => {
    const user = await createUser("user");
    const other = await createUser("user");

    await tx(user._id, "deposit");
    await tx(user._id, "withdraw");
    await tx(other._id, "deposit");

    expect((await unread(makeToken(user))).body.count).toBe(2);
  });

  // Badge က page ထဲ မြင်ရတဲ့ feed အတိုင်း ရေတွက်တယ် — တခြားသူဆီရောက်တဲ့
  // စာကို ရေတွက်ရင် "အသစ်ရှိတယ်" လို့ မှားပြမယ်။
  it("leaves another user's personal announcement out of the count", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");
    const other = await createUser("user");

    await announce({
      userId: admin._id,
      recipientId: other._id,
      title: "For other",
      content: "Not for you",
    });

    expect((await unread(makeToken(user))).body.count).toBe(0);
    expect((await unread(makeToken(other))).body.count).toBe(1);
  });

  it("treats a legacy row with no recipientId key as broadcast", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");

    await Announcement.collection.insertOne({
      userId: new mongoose.Types.ObjectId(admin._id),
      title: "Legacy broadcast",
      content: "Old row",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect((await unread(makeToken(user))).body.count).toBe(1);
  });

  it("counts every visible item until the account has read once", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");

    expect(user.notificationsSeenAt).toBeNull();

    await announce({
      userId: admin._id,
      recipientId: null,
      title: "One",
      content: "Body",
    });
    await tx(user._id);

    expect((await unread(makeToken(user))).body.count).toBe(2);
  });

  it("drops items created before the seen stamp", async () => {
    const admin = await createUser("admin");
    const user = await createUser("user");

    await announce({
      userId: admin._id,
      recipientId: null,
      title: "Old news",
      content: "Body",
    });
    await markSeen(makeToken(user));

    expect((await unread(makeToken(user))).body.count).toBe(0);

    await later();

    await announce({
      userId: admin._id,
      recipientId: null,
      title: "New news",
      content: "Body",
    });

    expect((await unread(makeToken(user))).body.count).toBe(1);
  });

  // Ruling: "အသစ်" က createdAt အပေါ် မူ — admin က pending deposit ကို
  // approve လုပ်တာကို badge နဲ့ မခေါ်ဘူး (card စာသားပဲ ပြောင်း)။
  it("does not re-badge a transaction that was only reviewed later", async () => {
    const user = await createUser("user");

    const deposit = await tx(user._id);
    await markSeen(makeToken(user));

    await Transaction.updateOne(
      { _id: deposit._id },
      { $set: { status: "accepted", reviewedAt: new Date() } },
    );

    expect((await unread(makeToken(user))).body.count).toBe(0);
  });

  it("counts every announcement for an admin, matching the list boundary", async () => {
    const admin = await createUser("admin");
    const other = await createUser("user");

    await announce({
      userId: admin._id,
      recipientId: other._id,
      title: "Personal",
      content: "Body",
    });
    await announce({
      userId: admin._id,
      recipientId: null,
      title: "Broadcast",
      content: "Body",
    });

    expect((await unread(makeToken(admin))).body.count).toBe(2);
  });
});

describe("POST /api/notifications/seen", () => {
  it("stamps the account and answers a cleared count", async () => {
    const user = await createUser("user");

    const res = await markSeen(makeToken(user));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);

    const fresh = await User.findById(user._id);
    expect(fresh.notificationsSeenAt).toBeInstanceOf(Date);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app).post("/api/notifications/seen").send();

    expect(res.status).toBe(401);
  });
});
