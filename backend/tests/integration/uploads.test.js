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

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

beforeAll(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  process.env.IMAGEKIT_PUBLIC_KEY = "public_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "private_test";
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/testid";
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

describe("GET /api/uploads/auth", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/uploads/auth?purpose=deposit-proof");
    expect(res.status).toBe(401);
  });

  it("rejects invalid purpose", async () => {
    const user = await createUser();
    const res = await request(app)
      .get("/api/uploads/auth?purpose=bad")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(400);
  });

  it("allows authenticated user for deposit proof", async () => {
    const user = await createUser();
    const res = await request(app)
      .get("/api/uploads/auth?purpose=deposit-proof")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe("public_test");
    expect(res.body.urlEndpoint).toBe("https://ik.imagekit.io/testid");
    expect(res.body.folder).toBe("/deposit-proofs");
    expect(res.body.signature).toBeTruthy();
    expect(res.body.privateKey).toBeUndefined();
  });

  it("rejects normal user for product purpose", async () => {
    const user = await createUser("user");
    const res = await request(app)
      .get("/api/uploads/auth?purpose=product")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(403);
  });

  it("allows admin for product purpose", async () => {
    const admin = await createUser("admin");
    const res = await request(app)
      .get("/api/uploads/auth?purpose=product")
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.folder).toBe("/products");
  });
});
