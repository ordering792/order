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

function get(token, query = "") {
  return request(app)
    .get(`/api/announcements${query}`)
    .set("Authorization", `Bearer ${token}`);
}

function post(token, body) {
  return request(app)
    .post("/api/announcements")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

describe("Announcements", () => {
  describe("POST /api/announcements", () => {
    it("stores a broadcast when no recipient is given", async () => {
      const admin = await createUser("admin");

      const res = await post(makeToken(admin), {
        title: "Maintenance",
        content: "Withdrawals pause at 10 PM.",
      });

      expect(res.status).toBe(201);
      expect(res.body.announcement.recipientId).toBeNull();
      expect(res.body.announcement.userId).toBe(admin._id.toString());
    });

    it("stores the recipient when one is chosen", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { name: "Ko Ko" });

      const res = await post(makeToken(admin), {
        title: "Your deposit",
        content: "We need the bank slip again.",
        recipientId: target._id.toString(),
      });

      expect(res.status).toBe(201);
      expect(res.body.announcement.recipientId).toBe(target._id.toString());
    });

    it("rejects a recipient that does not exist without writing a row", async () => {
      const admin = await createUser("admin");
      const ghost = new mongoose.Types.ObjectId().toString();

      const res = await post(makeToken(admin), {
        title: "Nobody",
        content: "This must not be stored.",
        recipientId: ghost,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/recipient/i);
      expect(await Announcement.countDocuments()).toBe(0);
    });

    it("rejects a recipient id that is not an object id", async () => {
      const admin = await createUser("admin");

      const res = await post(makeToken(admin), {
        title: "Bad id",
        content: "Body",
        recipientId: "not-an-id",
      });

      expect(res.status).toBe(400);
      expect(await Announcement.countDocuments()).toBe(0);
    });

    it("refuses to address a burned account", async () => {
      const admin = await createUser("admin");
      const burned = await createUser("user", { status: "burned" });

      const res = await post(makeToken(admin), {
        title: "Gone",
        content: "Body",
        recipientId: burned._id.toString(),
      });

      expect(res.status).toBe(400);
      expect(await Announcement.countDocuments()).toBe(0);
    });

    it("keeps publishing to admins only", async () => {
      const user = await createUser("user");

      const res = await post(makeToken(user), {
        title: "Not allowed",
        content: "Body",
      });

      expect(res.status).toBe(403);
      expect(await Announcement.countDocuments()).toBe(0);
    });
  });

  describe("GET /api/announcements", () => {
    it("shows a personal announcement only to its recipient", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user", { name: "Ko Ko" });
      const other = await createUser("user", { name: "Ma Ma" });

      await post(makeToken(admin), {
        title: "For Ko Ko",
        content: "Private note.",
        recipientId: target._id.toString(),
      });

      const mine = await get(makeToken(target));
      const theirs = await get(makeToken(other));

      expect(mine.body.announcements.map((a) => a.title)).toEqual([
        "For Ko Ko",
      ]);
      expect(theirs.body.announcements).toHaveLength(0);
    });

    it("shows a broadcast to every signed-in user", async () => {
      const admin = await createUser("admin");
      const one = await createUser("user");
      const two = await createUser("user");

      await post(makeToken(admin), {
        title: "New products",
        content: "Catalog updated.",
      });

      expect(
        (await get(makeToken(one))).body.announcements.map((a) => a.title),
      ).toEqual(["New products"]);
      expect(
        (await get(makeToken(two))).body.announcements.map((a) => a.title),
      ).toEqual(["New products"]);
    });

    it("treats a stored row without the recipient field as a broadcast", async () => {
      // Migration မတိုင်မီ rows — recipientId key လုံးဝ မပါ။
      const admin = await createUser("admin");
      const user = await createUser("user");

      await Announcement.collection.insertOne({
        userId: admin._id,
        title: "Legacy notice",
        content: "Written before targeting existed.",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await get(makeToken(user));

      expect(res.body.announcements.map((a) => a.title)).toEqual([
        "Legacy notice",
      ]);
    });

    it("lets an owner read broadcasts and their own note, not other people's", async () => {
      const admin = await createUser("admin");
      const owner = await createUser("owner");
      const stranger = await createUser("user");

      await post(makeToken(admin), { title: "Open", content: "All users." });
      await post(makeToken(admin), {
        title: "Owner note",
        content: "For you.",
        recipientId: owner._id.toString(),
      });
      await post(makeToken(admin), {
        title: "Stranger note",
        content: "Not for you.",
        recipientId: stranger._id.toString(),
      });

      const res = await get(makeToken(owner));

      expect(res.body.announcements.map((a) => a.title).sort()).toEqual([
        "Open",
        "Owner note",
      ]);
    });

    it("filters the admin list by audience", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");

      await post(makeToken(admin), { title: "Broadcast", content: "All." });
      await post(makeToken(admin), {
        title: "Personal",
        content: "One.",
        recipientId: target._id.toString(),
      });

      const personal = await get(makeToken(admin), "?audience=personal");
      const broadcast = await get(makeToken(admin), "?audience=all");
      const everything = await get(makeToken(admin));

      expect(personal.body.announcements.map((a) => a.title)).toEqual([
        "Personal",
      ]);
      expect(personal.body.announcements[0].recipientId.name).toBe(target.name);
      expect(broadcast.body.announcements.map((a) => a.title)).toEqual([
        "Broadcast",
      ]);
      expect(everything.body.announcements).toHaveLength(2);
    });

    it("does not let a normal user widen the list with the audience param", async () => {
      const admin = await createUser("admin");
      const target = await createUser("user");
      const nosy = await createUser("user");

      await post(makeToken(admin), {
        title: "Private",
        content: "Only for Ko Ko.",
        recipientId: target._id.toString(),
      });

      const res = await get(makeToken(nosy), "?audience=personal");

      expect(res.status).toBe(200);
      expect(res.body.announcements).toHaveLength(0);
    });

    it("rejects an unknown audience value", async () => {
      const admin = await createUser("admin");

      const res = await get(makeToken(admin), "?audience=someone");

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/announcements/:id", () => {
    async function publishPersonal() {
      const admin = await createUser("admin");
      const target = await createUser("user");
      const other = await createUser("user");

      const created = await post(makeToken(admin), {
        title: "Private",
        content: "For one user.",
        recipientId: target._id.toString(),
      });

      return {
        admin,
        target,
        other,
        id: created.body.announcement._id.toString(),
      };
    }

    it("returns a personal announcement to its recipient and to the admin", async () => {
      const { admin, target, id } = await publishPersonal();

      expect((await get(makeToken(target), `/${id}`)).status).toBe(200);
      expect((await get(makeToken(admin), `/${id}`)).status).toBe(200);
    });

    it("hides another user's announcement behind a 404", async () => {
      const { other, id } = await publishPersonal();

      const res = await get(makeToken(other), `/${id}`);

      expect(res.status).toBe(404);
      expect(res.body.announcement).toBeUndefined();
    });

    it("still 404s for a missing id and 400 for a malformed one", async () => {
      const admin = await createUser("admin");

      expect(
        (await get(makeToken(admin), `/${new mongoose.Types.ObjectId()}`))
          .status,
      ).toBe(404);
      expect((await get(makeToken(admin), "/nope")).status).toBe(400);
    });
  });
});
