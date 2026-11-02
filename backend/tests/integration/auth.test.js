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

    it("reports the license flag so the client can route to /license", async () => {
      const fresh = await request(app)
        .post("/api/auth/login")
        .send({ phone: "09987654321", password: "password123" });
      expect(fresh.body.user.licenseAcceptedAt).toBeNull();

      await User.updateOne(
        { phone: "09987654321" },
        { licenseAcceptedAt: new Date("2026-02-02T00:00:00.000Z") },
      );

      const accepted = await request(app)
        .post("/api/auth/login")
        .send({ phone: "09987654321", password: "password123" });
      expect(accepted.body.user.licenseAcceptedAt).toBeTruthy();
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

  describe("POST /api/auth/license-accept", () => {
    async function createUser(overrides = {}) {
      return User.create({
        name: "License User",
        phone: "09222222222",
        passwordHash: "hashed",
        invitationCode: "LIC00001",
        ...overrides,
      });
    }

    it("stamps the acceptance time, IP and user agent", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/auth/license-accept")
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", "jest-agent");

      expect(res.status).toBe(200);
      expect(res.body.licenseAcceptedAt).toBeTruthy();

      const saved = await User.findById(user._id);
      expect(saved.licenseAcceptedAt).toBeInstanceOf(Date);
      expect(saved.licenseUserAgent).toBe("jest-agent");
      expect(saved.licenseIpAddress).toBeTruthy();
    });

    it("keeps the first acceptance record when called again", async () => {
      const first = new Date("2026-01-01T00:00:00.000Z");
      const user = await createUser({
        licenseAcceptedAt: first,
        licenseIpAddress: "1.1.1.1",
        licenseUserAgent: "first-device",
      });
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/auth/license-accept")
        .set("Authorization", `Bearer ${token}`)
        .set("User-Agent", "second-device");

      expect(res.status).toBe(200);
      expect(new Date(res.body.licenseAcceptedAt).toISOString()).toBe(
        first.toISOString(),
      );

      const saved = await User.findById(user._id);
      expect(saved.licenseUserAgent).toBe("first-device");
      expect(saved.licenseIpAddress).toBe("1.1.1.1");
    });

    it("stamps users created before the field existed", async () => {
      // Field မရှိသေးတဲ့ document အဟောင်းတွေမှာ licenseAcceptedAt က undefined —
      // { licenseAcceptedAt: null } filter ကို မကိုက်ရင် အသုံးပြုသူ အဟောင်းတွေ
      // agreement ကို ဘယ်တော့မှ မှတ်လို့မရဘူး။
      const user = await createUser();
      await User.updateOne({ _id: user._id }, { $unset: { licenseAcceptedAt: 1 } });
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/auth/license-accept")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.licenseAcceptedAt).toBeTruthy();
    });

    it("reports the flag through /api/auth/me", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const before = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(before.body.user.licenseAcceptedAt).toBeNull();

      await request(app)
        .post("/api/auth/license-accept")
        .set("Authorization", `Bearer ${token}`);

      const after = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(after.body.user.licenseAcceptedAt).toBeTruthy();
    });

    it("rejects without token", async () => {
      const res = await request(app).post("/api/auth/license-accept");
      expect(res.status).toBe(401);
    });
  });
});
