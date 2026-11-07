// Login surface gate — customer app (/auth/login) နဲ့ admin panel (/auth/staff-login)
// တစ်ခုစီရဲ့ role အဝင်အထွက်ကို စစ်တဲ့ဖိုင်။ loginLimit က IP တစ်ခုကို ၁၀ ချိန်/၁၅ မိနစ်
// ပိတ်ထားလို့ ဒီဖိုင်မှာ login POST အရေအတွက် ၁၀ အောက် ထားရမယ်။
const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = require("../../src/app");
const User = require("../../src/models/User");

const OLD_LOGIN = new Date("2026-01-01T00:00:00.000Z");

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

async function createAccount(role, phone) {
  const passwordHash = await bcrypt.hash("password123", 10);
  return User.create({
    name: `${role} account`,
    phone,
    passwordHash,
    invitationCode: `SURF${phone.slice(-4)}`,
    role,
    lastLoginAt: OLD_LOGIN,
  });
}

function customerLogin(phone) {
  return request(app)
    .post("/api/auth/login")
    .send({ phone, password: "password123" });
}

function staffLogin(phone) {
  return request(app)
    .post("/api/auth/staff-login")
    .send({ phone, password: "password123" });
}

describe("Login surfaces", () => {
  describe("POST /api/auth/login (customer app)", () => {
    it("refuses an admin account and issues no token", async () => {
      await createAccount("admin", "09111100001");

      const res = await customerLogin("09111100001");

      expect(res.status).toBe(409);
      expect(res.body.token).toBeUndefined();
      expect(res.body.message).toMatch(/admin panel/i);

      // App မှားဝင်တဲ့ကြိမ်ကို login အဖြစ် မမှတ်ရ — admin panel က "နောက်ဆုံးဝင်"
      // column ထဲမှာ မှားဖတ်လိုက်ရမှာစိုးလို့။
      const saved = await User.findOne({ phone: "09111100001" });
      expect(saved.lastLoginAt).toEqual(OLD_LOGIN);
    });

    it("refuses an owner account", async () => {
      await createAccount("owner", "09111100002");

      const res = await customerLogin("09111100002");

      expect(res.status).toBe(409);
      expect(res.body.token).toBeUndefined();
    });

    it("still signs in a role=user account", async () => {
      const user = await createAccount("user", "09111100004");

      const res = await customerLogin("09111100004");

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.id).toBe(user._id.toString());
    });

    it("keeps a wrong password at 401 even for a staff account", async () => {
      await createAccount("admin", "09111100005");

      const res = await request(app)
        .post("/api/auth/login")
        .send({ phone: "09111100005", password: "wrongpassword" });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Invalid phone or password");
    });
  });

  describe("POST /api/auth/staff-login (admin panel)", () => {
    it("refuses a role=user account and issues no token", async () => {
      await createAccount("user", "09111100006");

      const res = await staffLogin("09111100006");

      expect(res.status).toBe(409);
      expect(res.body.token).toBeUndefined();
      expect(res.body.message).toMatch(/customer app/i);
    });

    it("signs in both admin and owner accounts", async () => {
      const admin = await createAccount("admin", "09111100007");
      const owner = await createAccount("owner", "09111100008");

      const adminRes = await staffLogin("09111100007");
      const ownerRes = await staffLogin("09111100008");

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.user.id).toBe(admin._id.toString());
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.user.id).toBe(owner._id.toString());
      expect(ownerRes.body.user.role).toBe("owner");
    });

    it("records the panel login time", async () => {
      await createAccount("admin", "09111100009");

      await staffLogin("09111100009");

      const saved = await User.findOne({ phone: "09111100009" });
      expect(saved.lastLoginAt.getTime()).toBeGreaterThan(
        OLD_LOGIN.getTime(),
      );
    });

    it("keeps the burn ahead of the surface check", async () => {
      await createAccount("admin", "09111100010");
      await User.updateOne({ phone: "09111100010" }, { status: "burned" });

      const panel = await staffLogin("09111100010");
      expect(panel.status).toBe(403);
      expect(panel.body.message).toMatch(/deactivated/);
    });
  });
});
