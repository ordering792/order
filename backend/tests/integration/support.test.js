const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Conversation = require("../../src/models/Conversation");
const Message = require("../../src/models/Message");
const bcrypt = require("bcryptjs");

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

const GUEST_ID = "guest-12345678";

describe("Support endpoints", () => {
  describe("guest flow", () => {
    it("starts a conversation as guest", async () => {
      const res = await request(app)
        .post("/api/support/conversations")
        .send({ guestId: GUEST_ID, subject: "Help me" });

      expect(res.status).toBe(201);
      expect(res.body.conversation.guestId).toBe(GUEST_ID);
      expect(res.body.conversation.userId).toBeNull();
      expect(res.body.conversation.status).toBe("open");
    });

    it("requires guestId or auth", async () => {
      const res = await request(app)
        .post("/api/support/conversations")
        .send({});
      expect(res.status).toBe(401);
    });

    it("guest sends a message and history is stored", async () => {
      const start = await request(app)
        .post("/api/support/conversations")
        .send({ guestId: GUEST_ID });
      const convId = start.body.conversation._id;

      const msg = await request(app)
        .post(`/api/support/conversations/${convId}/messages`)
        .send({ guestId: GUEST_ID, body: "Hello support" });

      expect(msg.status).toBe(201);
      expect(msg.body.message.senderType).toBe("customer");

      const get = await request(app)
        .get(`/api/support/conversations/${convId}`)
        .query({ guestId: GUEST_ID });

      expect(get.status).toBe(200);
      expect(get.body.messages).toHaveLength(1);
      expect(get.body.messages[0].body).toBe("Hello support");
      expect(get.body.conversation.lastMessagePreview).toBe("Hello support");
      expect(get.body.conversation.unreadByAdmin).toBe(true);
    });

    it("guest cannot access another guest's conversation", async () => {
      const start = await request(app)
        .post("/api/support/conversations")
        .send({ guestId: "other-guest" });
      const convId = start.body.conversation._id;

      const res = await request(app)
        .get(`/api/support/conversations/${convId}`)
        .query({ guestId: GUEST_ID });

      expect(res.status).toBe(404);
    });

    it("lists only own guest conversations", async () => {
      await request(app)
        .post("/api/support/conversations")
        .send({ guestId: "guest-a" });
      await request(app)
        .post("/api/support/conversations")
        .send({ guestId: "guest-b" });

      const res = await request(app)
        .get("/api/support/conversations")
        .query({ guestId: "guest-a" });

      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].guestId).toBe("guest-a");
    });

    it("guest cannot send message to closed conversation", async () => {
      const start = await request(app)
        .post("/api/support/conversations")
        .send({ guestId: GUEST_ID });
      const convId = start.body.conversation._id;

      await request(app)
        .post(`/api/support/conversations/${convId}/close`)
        .send({ guestId: GUEST_ID });

      const res = await request(app)
        .post(`/api/support/conversations/${convId}/messages`)
        .send({ guestId: GUEST_ID, body: "after close" });

      expect(res.status).toBe(409);
    });
  });

  describe("registered user flow", () => {
    it("starts a conversation linked to account", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/support/conversations")
        .set("Authorization", `Bearer ${token}`)
        .send({ subject: "Account issue" });

      expect(res.status).toBe(201);
      expect(res.body.conversation.userId).toBe(user._id.toString());
      expect(res.body.conversation.guestId).toBeNull();
    });

    it("JWT takes precedence over guestId", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .post("/api/support/conversations")
        .set("Authorization", `Bearer ${token}`)
        .send({ guestId: GUEST_ID });

      expect(res.status).toBe(201);
      expect(res.body.conversation.userId).toBe(user._id.toString());
      expect(res.body.conversation.guestId).toBeNull();
    });

    it("user cannot access another user's conversation", async () => {
      const userA = await createUser();
      const userB = await createUser();
      const tokenB = makeToken(userB);

      const start = await request(app)
        .post("/api/support/conversations")
        .set("Authorization", `Bearer ${makeToken(userA)}`)
        .send({});
      const convId = start.body.conversation._id;

      const res = await request(app)
        .get(`/api/support/conversations/${convId}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });

  describe("admin support staff flow", () => {
    it("admin lists all conversations with pagination", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      for (let i = 0; i < 3; i++) {
        await Conversation.create({ guestId: `g-${i}`, subject: `Issue ${i}` });
      }

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.conversations).toHaveLength(3);
    });

    it("admin filters by status", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      await Conversation.create({ guestId: "g-1", status: "open" });
      await Conversation.create({ guestId: "g-2", status: "closed" });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ status: "open" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].guestId).toBe("g-1");
    });

    it("admin replies to a conversation", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const conv = await Conversation.create({ guestId: GUEST_ID });

      const res = await request(app)
        .post(`/api/support/admin/conversations/${conv._id}/messages`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "We are here to help" });

      expect(res.status).toBe(201);
      expect(res.body.message.senderType).toBe("admin");

      const updated = await Conversation.findById(conv._id);
      expect(updated.lastMessageSender).toBe("admin");
      expect(updated.unreadByCustomer).toBe(true);
      expect(updated.unreadByAdmin).toBe(false);
    });

    it("admin closes and reopens a conversation", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const conv = await Conversation.create({ guestId: GUEST_ID });

      const closed = await request(app)
        .post(`/api/support/admin/conversations/${conv._id}/close`)
        .set("Authorization", `Bearer ${token}`);
      expect(closed.status).toBe(200);
      expect(closed.body.conversation.status).toBe("closed");

      const reopened = await request(app)
        .post(`/api/support/admin/conversations/${conv._id}/reopen`)
        .set("Authorization", `Bearer ${token}`);
      expect(reopened.status).toBe(200);
      expect(reopened.body.conversation.status).toBe("open");
      expect(reopened.body.conversation.closedAt).toBeNull();
    });

    it("admin marks conversation as read", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const conv = await Conversation.create({
        guestId: GUEST_ID,
        unreadByAdmin: true,
      });
      await Message.create({
        conversationId: conv._id,
        senderType: "customer",
        guestId: GUEST_ID,
        body: "unread message",
      });

      const res = await request(app)
        .post(`/api/support/admin/conversations/${conv._id}/read`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.conversation.unreadByAdmin).toBe(false);

      const msg = await Message.findOne({ conversationId: conv._id });
      expect(msg.readAt).not.toBeNull();
    });

    it("searches conversations by customer name", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const customer = await User.create({
        name: "Thura Kaung",
        phone: "0977000111",
        passwordHash: await bcrypt.hash("password123", 10),
        invitationCode: "SEARCH01",
      });
      await Conversation.create({ userId: customer._id, subject: "Deposit" });
      await Conversation.create({ guestId: "g-none", subject: "Deposit" });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ search: "thura" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].userId._id).toBe(customer._id.toString());
    });

    it("searches conversations by customer phone", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const customer = await User.create({
        name: "Phone Search",
        phone: "0944556677",
        passwordHash: await bcrypt.hash("password123", 10),
        invitationCode: "SEARCH02",
      });
      await Conversation.create({ userId: customer._id, subject: "Withdraw" });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ search: "556677" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].userId.phone).toBe("0944556677");
    });

    it("searches conversations by guestId", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      await Conversation.create({ guestId: "guest-aa77bb99", subject: "Hello" });
      await Conversation.create({ guestId: "guest-cc88dd00", subject: "Hello" });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ search: "aa77bb" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].guestId).toBe("guest-aa77bb99");
    });

    it("combines search with status filter", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      await Conversation.create({ guestId: "g-open", subject: "Report" });
      await Conversation.create({
        guestId: "g-closed",
        subject: "Report",
        status: "closed",
      });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ search: "Report", status: "open" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].guestId).toBe("g-open");
    });

    it("non-admin cannot access admin endpoints", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("admin endpoint requires authentication", async () => {
      const res = await request(app).get("/api/support/admin/conversations");
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid conversation id", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const res = await request(app)
        .get("/api/support/admin/conversations/not-an-id")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe("unread counts and participant tabs", () => {
    it("splits the list by participant type", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);
      const customer = await createUser();

      await Conversation.create({ guestId: "g-tab-1", subject: "Guest issue" });
      await Conversation.create({ userId: customer._id, subject: "User issue" });

      const guests = await request(app)
        .get("/api/support/admin/conversations")
        .query({ participant: "guests" })
        .set("Authorization", `Bearer ${token}`);
      expect(guests.status).toBe(200);
      expect(guests.body.conversations).toHaveLength(1);
      expect(guests.body.conversations[0].subject).toBe("Guest issue");

      const users = await request(app)
        .get("/api/support/admin/conversations")
        .query({ participant: "users" })
        .set("Authorization", `Bearer ${token}`);
      expect(users.status).toBe(200);
      expect(users.body.conversations).toHaveLength(1);
      expect(users.body.conversations[0].subject).toBe("User issue");

      const all = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${token}`);
      expect(all.body.conversations).toHaveLength(2);
    });

    it("counts conversations per tab and ignores the search term", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);
      const customer = await createUser();

      await Conversation.create({ guestId: "g-count-1" });
      await Conversation.create({ guestId: "g-count-2" });
      await Conversation.create({ userId: customer._id });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ search: "zzz-no-match" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(0);
      // Tab ဂဏန်းတွေက mailbox အလိုက် স্থির — search ရိုက်တိုင်း မပြောင်းဘူး။
      expect(res.body.counts).toEqual({ all: 3, users: 1, guests: 2 });
    });

    it("counts only unread customer messages", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const conv = await Conversation.create({ guestId: GUEST_ID });
      await Message.create({
        conversationId: conv._id,
        senderType: "customer",
        guestId: GUEST_ID,
        body: "first",
      });
      await Message.create({
        conversationId: conv._id,
        senderType: "customer",
        guestId: GUEST_ID,
        body: "second",
      });
      await Message.create({
        conversationId: conv._id,
        senderType: "admin",
        userId: admin._id,
        body: "our reply does not count",
      });

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.conversations[0].unreadCountByAdmin).toBe(2);
    });

    it("clears the unread count once the admin marks it read", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const conv = await Conversation.create({ guestId: GUEST_ID });
      await Message.create({
        conversationId: conv._id,
        senderType: "customer",
        guestId: GUEST_ID,
        body: "please read",
      });

      const before = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${token}`);
      expect(before.body.conversations[0].unreadCountByAdmin).toBe(1);

      const read = await request(app)
        .post(`/api/support/admin/conversations/${conv._id}/read`)
        .set("Authorization", `Bearer ${token}`);
      expect(read.status).toBe(200);

      const after = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${token}`);
      expect(after.body.conversations[0].unreadCountByAdmin).toBe(0);
    });

    it("rejects an unknown participant value", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .query({ participant: "owners" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it("blocks an owner from marking another owner's conversation read", async () => {
      const ownerA = await createUser("owner");
      const ownerB = await createUser("owner");
      const customer = await createUser("user");

      const conv = await Conversation.create({
        userId: customer._id,
        ownerId: ownerB._id,
      });
      await Message.create({
        conversationId: conv._id,
        senderType: "customer",
        userId: customer._id,
        body: "mine only",
      });

      const res = await request(app)
        .post(`/api/support/admin/conversations/${conv._id}/read`)
        .set("Authorization", `Bearer ${makeToken(ownerA)}`);

      expect(res.status).toBe(404);

      const msg = await Message.findOne({ conversationId: conv._id });
      expect(msg.readAt).toBeNull();
    });
  });

  describe("conversation deletion", () => {
    async function seedConversation() {
      const conv = await Conversation.create({ guestId: GUEST_ID });
      await Message.create({
        conversationId: conv._id,
        senderType: "customer",
        guestId: GUEST_ID,
        body: "junk",
      });
      return conv;
    }

    it("admin deletes the conversation together with its messages", async () => {
      const admin = await createUser("admin");
      const conv = await seedConversation();

      const res = await request(app)
        .delete(`/api/support/admin/conversations/${conv._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(await Conversation.findById(conv._id)).toBeNull();
      expect(await Message.countDocuments({ conversationId: conv._id })).toBe(0);
    });

    it("leaves other conversations untouched", async () => {
      const admin = await createUser("admin");
      const junk = await seedConversation();
      const kept = await seedConversation();

      await request(app)
        .delete(`/api/support/admin/conversations/${junk._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(await Conversation.findById(kept._id)).not.toBeNull();
      expect(await Message.countDocuments({ conversationId: kept._id })).toBe(1);
    });

    it("blocks an owner even for a conversation they own", async () => {
      const owner = await createUser("owner");
      const customer = await createUser("user");
      const conv = await Conversation.create({
        userId: customer._id,
        ownerId: owner._id,
      });

      const res = await request(app)
        .delete(`/api/support/admin/conversations/${conv._id}`)
        .set("Authorization", `Bearer ${makeToken(owner)}`);

      expect(res.status).toBe(403);
      expect(await Conversation.findById(conv._id)).not.toBeNull();
    });

    it("blocks a customer and an anonymous caller", async () => {
      const user = await createUser("user");
      const conv = await seedConversation();

      const asUser = await request(app)
        .delete(`/api/support/admin/conversations/${conv._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);
      expect(asUser.status).toBe(403);

      const anonymous = await request(app).delete(
        `/api/support/admin/conversations/${conv._id}`,
      );
      expect(anonymous.status).toBe(401);

      expect(await Conversation.findById(conv._id)).not.toBeNull();
    });

    it("rejects an invalid id and an unknown conversation", async () => {
      const admin = await createUser("admin");
      const token = makeToken(admin);

      const invalid = await request(app)
        .delete("/api/support/admin/conversations/not-an-id")
        .set("Authorization", `Bearer ${token}`);
      expect(invalid.status).toBe(400);

      const missing = await request(app)
        .delete(`/api/support/admin/conversations/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${token}`);
      expect(missing.status).toBe(404);
    });
  });

  describe("validation", () => {
    it("rejects empty message body", async () => {
      const start = await request(app)
        .post("/api/support/conversations")
        .send({ guestId: GUEST_ID });
      const convId = start.body.conversation._id;

      const res = await request(app)
        .post(`/api/support/conversations/${convId}/messages`)
        .send({ guestId: GUEST_ID, body: "" });

      expect(res.status).toBe(400);
    });

    it("rejects subject longer than 200 chars", async () => {
      const res = await request(app)
        .post("/api/support/conversations")
        .send({ guestId: GUEST_ID, subject: "x".repeat(201) });

      expect(res.status).toBe(400);
    });
  });
});
