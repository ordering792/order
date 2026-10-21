const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../../src/app");
const User = require("../../src/models/User");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const MASTER_CODE = process.env.DEFAULT_INVITATION_CODE || "MASTER2024";

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

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

describe("Auth endpoints", () => {
  describe("POST /api/auth/register", () => {
    it("registers a new user and returns a token", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Test User",
        phone: "09123456789",
        password: "password123",
        invitationCode: MASTER_CODE,
      });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.phone).toBe("09123456789");
      expect(res.body.user.invitationCode).toBeDefined();
    });

    it("rejects duplicate phone numbers", async () => {
      await User.create({
        name: "Existing",
        phone: "09123456789",
        passwordHash: "hashed",
        invitationCode: "EXIST1",
      });

      const res = await request(app).post("/api/auth/register").send({
        name: "Test User",
        phone: "09123456789",
        password: "password123",
        invitationCode: MASTER_CODE,
      });

      expect(res.status).toBe(409);
    });

    it("rejects invalid data", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash("password123", 10);
      await User.create({
        name: "Login User",
        phone: "09987654321",
        passwordHash,
        invitationCode: "LOGIN01",
      });
    });

    it("logs in with valid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ phone: "09987654321", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.phone).toBe("09987654321");
    });

    it("rejects invalid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ phone: "09987654321", password: "wrongpassword" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns the current user", async () => {
      const user = await User.create({
        name: "Me User",
        phone: "09111111111",
        passwordHash: "hashed",
        invitationCode: "ME00001",
      });

      const token = makeToken(user);

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe("09111111111");
    });

    it("rejects without token", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });
  });
});
