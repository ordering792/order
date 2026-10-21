const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Conversation = require("../../src/models/Conversation");

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
  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

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

describe("Role system: Admin creates owners", () => {
  it("admin can create an owner account", async () => {
    const admin = await createUser("admin");

    const res = await request(app)
      .post("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({
        name: "Owner A",
        phone: "09111111111",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.owner.role).toBe("owner");
    expect(res.body.owner.ownerInviteCode).toBeDefined();
    expect(res.body.owner.invitationCode).toBeDefined();
    expect(res.body.owner.ownerInviteCode).not.toBe(
      res.body.owner.invitationCode,
    );
  });

  it("owner account has unique codes", async () => {
    const admin = await createUser("admin");

    const first = await request(app)
      .post("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ name: "Owner 1", phone: "09111111111", password: "password123" });

    const second = await request(app)
      .post("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ name: "Owner 2", phone: "09222222222", password: "password123" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.owner.ownerInviteCode).not.toBe(
      second.body.owner.ownerInviteCode,
    );
    expect(first.body.owner.invitationCode).not.toBe(
      second.body.owner.invitationCode,
    );
  });

  it("non-admin cannot create owners", async () => {
    const user = await createUser("user");
    const owner = await createUser("owner");

    const asUser = await request(app)
      .post("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ name: "X", phone: "09333333333", password: "password123" });
    expect(asUser.status).toBe(403);

    const asOwner = await request(app)
      .post("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(owner)}`)
      .send({ name: "Y", phone: "09444444444", password: "password123" });
    expect(asOwner.status).toBe(403);
  });

  it("admin can list owners with user count", async () => {
    const admin = await createUser("admin");
    const owner = await createUser("owner", { ownerInviteCode: "OWN1CODE" });

    // Create a user under this owner
    await createUser("user", { ownerId: owner._id });

    const res = await request(app)
      .get("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.owners).toHaveLength(1);
    expect(res.body.owners[0].userCount).toBe(1);
    expect(res.body.owners[0].ownerInviteCode).toBe("OWN1CODE");
  });

  it("rejects duplicate phone when creating owner", async () => {
    const admin = await createUser("admin");
    await createUser("user", { phone: "09555555555" });

    const res = await request(app)
      .post("/api/auth/owners")
      .set("Authorization", `Bearer ${makeToken(admin)}`)
      .send({ name: "Dup", phone: "09555555555", password: "password123" });

    expect(res.status).toBe(409);
  });
});

describe("Hierarchical invite registration", () => {
  it("owner invite code creates user under that owner", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "MYOWN123" });

    const res = await request(app).post("/api/auth/register").send({
      name: "New User",
      phone: "09123456789",
      password: "password123",
      invitationCode: "SOMECODE",
      referredByCode: "MYOWN123",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ownerId).toBe(owner._id.toString());
  });

  it("user-to-user invite keeps user under same owner", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "OWNX999" });
    const userA = await createUser("user", { ownerId: owner._id });

    // User A invites User B using A's invitation code
    const res = await request(app).post("/api/auth/register").send({
      name: "User B",
      phone: "09987654321",
      password: "password123",
      invitationCode: "SOMECODE",
      referredByCode: userA.invitationCode,
    });

    expect(res.status).toBe(201);
    // B belongs to the OWNER, not to userA directly
    expect(res.body.user.ownerId).toBe(owner._id.toString());
  });

  it("invalid invite code is rejected", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Bad",
      phone: "09111111111",
      password: "password123",
      invitationCode: "SOMECODE",
      referredByCode: "INVALIDCODE",
    });

    expect(res.status).toBe(400);
  });

  it("master invitation code without referredByCode still works", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Master User",
      phone: "09123456789",
      password: "password123",
      invitationCode: MASTER_CODE,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ownerId).toBeNull();
  });

  it("wrong master code without referredByCode is rejected", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Wrong Code",
      phone: "09123456789",
      password: "password123",
      invitationCode: "WRONGCODE",
    });

    expect(res.status).toBe(400);
  });

  it("user invitation code in invitationCode field registers under same owner", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "OWNY777" });
    const userA = await createUser("user", { ownerId: owner._id });

    const res = await request(app).post("/api/auth/register").send({
      name: "Invited B",
      phone: "09654321098",
      password: "password123",
      invitationCode: userA.invitationCode,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ownerId).toBe(owner._id.toString());
    const created = await User.findOne({ phone: "09654321098" });
    expect(created.referredByCode).toBe(userA.invitationCode);
  });

  it("owner invite code in invitationCode field registers under owner", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "OWNZ888" });

    const res = await request(app).post("/api/auth/register").send({
      name: "Owner Invited",
      phone: "09654321097",
      password: "password123",
      invitationCode: "OWNZ888",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ownerId).toBe(owner._id.toString());
  });

  it("unknown code in invitationCode field is still rejected", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Ghost Code",
      phone: "09654321096",
      password: "password123",
      invitationCode: "GHOST999",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid invitation code");
  });

  it("owner registering with their own code puts them under themselves? no — owner invites create users", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "SELFCODE" });

    const res = await request(app).post("/api/auth/register").send({
      name: "Under Self",
      phone: "09777777777",
      password: "password123",
      invitationCode: "SOMECODE",
      referredByCode: "SELFCODE",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.ownerId).toBe(owner._id.toString());
    expect(res.body.user.role).toBe("user");
  });

  it("registers successfully without confirmPassword", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "No Confirm",
      phone: "09123456789",
      password: "password123",
      invitationCode: MASTER_CODE,
    });

    expect(res.status).toBe(201);
  });
});

describe("Owner middleware access", () => {
  it("owner can access owner-only routes", async () => {
    const owner = await createUser("owner");

    const res = await request(app)
      .get("/api/support/admin/conversations")
      .set("Authorization", `Bearer ${makeToken(owner)}`);

    expect(res.status).toBe(200);
  });

  it("regular user cannot access owner routes", async () => {
    const user = await createUser("user");

    const res = await request(app)
      .get("/api/support/admin/conversations")
      .set("Authorization", `Bearer ${makeToken(user)}`);

    expect(res.status).toBe(403);
  });

  it("admin can access owner routes too", async () => {
    const admin = await createUser("admin");

    const res = await request(app)
      .get("/api/support/admin/conversations")
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(200);
  });
});

describe("Customer service: user to owner routing", () => {
  it("conversation created by user carries ownerId", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "CSOWNER" });
    const user = await createUser("user", { ownerId: owner._id });

    const res = await request(app)
      .post("/api/support/conversations")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ subject: "Help" });

    expect(res.status).toBe(201);
    expect(res.body.conversation.ownerId).toBe(owner._id.toString());
    expect(res.body.conversation.userId).toBe(user._id.toString());
  });

  it("owner sees only their users' conversations", async () => {
    const ownerA = await createUser("owner", { ownerInviteCode: "OWNA1" });
    const ownerB = await createUser("owner", { ownerInviteCode: "OWNB1" });
    const userA = await createUser("user", { ownerId: ownerA._id });
    const userB = await createUser("user", { ownerId: ownerB._id });

    await request(app)
      .post("/api/support/conversations")
      .set("Authorization", `Bearer ${makeToken(userA)}`)
      .send({ subject: "A's issue" });

    await request(app)
      .post("/api/support/conversations")
      .set("Authorization", `Bearer ${makeToken(userB)}`)
      .send({ subject: "B's issue" });

    const resA = await request(app)
      .get("/api/support/admin/conversations")
      .set("Authorization", `Bearer ${makeToken(ownerA)}`);

    expect(resA.status).toBe(200);
    expect(resA.body.conversations).toHaveLength(1);
    expect(resA.body.conversations[0].subject).toBe("A's issue");
  });

  it("admin sees all conversations", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "OVW1" });
    const user = await createUser("user", { ownerId: owner._id });
    const guestConv = await Conversation.create({ guestId: "guest-x" });

    await request(app)
      .post("/api/support/conversations")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({ subject: "User issue" });

    const admin = await createUser("admin");
    const res = await request(app)
      .get("/api/support/admin/conversations")
      .set("Authorization", `Bearer ${makeToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("owner cannot access another owner's conversation detail", async () => {
    const ownerA = await createUser("owner", { ownerInviteCode: "OWNA2" });
    const ownerB = await createUser("owner", { ownerInviteCode: "OWNB2" });
    const userA = await createUser("user", { ownerId: ownerA._id });

    const start = await request(app)
      .post("/api/support/conversations")
      .set("Authorization", `Bearer ${makeToken(userA)}`)
      .send({});
    const convId = start.body.conversation._id;

    const res = await request(app)
      .get(`/api/support/admin/conversations/${convId}`)
      .set("Authorization", `Bearer ${makeToken(ownerB)}`);

    expect(res.status).toBe(404);
  });

  it("owner can reply to their user's conversation", async () => {
    const owner = await createUser("owner", { ownerInviteCode: "OREPLY" });
    const user = await createUser("user", { ownerId: owner._id });

    const start = await request(app)
      .post("/api/support/conversations")
      .set("Authorization", `Bearer ${makeToken(user)}`)
      .send({});
    const convId = start.body.conversation._id;

    const res = await request(app)
      .post(`/api/support/admin/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${makeToken(owner)}`)
      .send({ body: "Hello from owner" });

    expect(res.status).toBe(201);
    expect(res.body.message.senderType).toBe("admin");
  });

  it("guest conversations have no ownerId and are visible to admin only", async () => {
    const start = await request(app)
      .post("/api/support/conversations")
      .send({ guestId: "guest-1" });
    expect(start.status).toBe(201);
    expect(start.body.conversation.ownerId).toBeNull();

    const owner = await createUser("owner", { ownerInviteCode: "GOWN" });
    const res = await request(app)
      .get("/api/support/admin/conversations")
      .set("Authorization", `Bearer ${makeToken(owner)}`);

    expect(res.status).toBe(200);
    // ownerId null conversations should not appear for owners
    expect(res.body.conversations).toHaveLength(0);
  });
});
