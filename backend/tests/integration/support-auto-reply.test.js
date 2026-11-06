const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Conversation = require("../../src/models/Conversation");
const Message = require("../../src/models/Message");
const bcrypt = require("bcryptjs");
const {
  GREETING_BODY,
  KEYWORD_REPLIES,
} = require("../../src/services/supportAutoReply");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const GUEST_ID = "guest-auto-0001";

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
    name: `auto reply ${role}`,
    phone: `09${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`,
    passwordHash,
    invitationCode: `AUTO${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    role,
  });
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function startGuestConversation(guestId = GUEST_ID) {
  const res = await request(app)
    .post("/api/support/conversations")
    .send({ guestId });

  return res.body.conversation._id;
}

function sendGuestMessage(conversationId, body, guestId = GUEST_ID) {
  return request(app)
    .post(`/api/support/conversations/${conversationId}/messages`)
    .send({ guestId, body });
}

describe("Support auto reply", () => {
  describe("greeting", () => {
    it("appends the greeting to the first message and reports it in the response", async () => {
      const convId = await startGuestConversation();
      const res = await sendGuestMessage(convId, "hello there");

      expect(res.status).toBe(201);
      expect(res.body.autoReplies).toHaveLength(1);
      expect(res.body.autoReplies[0].body).toBe(GREETING_BODY);
      // CS bubble အတိုင်းပဲ — admin panel ရဲ့ render branch မပြောင်းရအောင်။
      expect(res.body.autoReplies[0].senderType).toBe("admin");
      expect(res.body.autoReplies[0].autoKind).toBe("greeting");

      const stored = await Message.find({ conversationId: convId }).sort({
        createdAt: 1,
        _id: 1,
      });
      expect(stored).toHaveLength(2);
      expect(stored[0].senderType).toBe("customer");
      expect(stored[1].autoKind).toBe("greeting");
    });

    it("fires once per guest lifetime, even in a new conversation", async () => {
      const first = await startGuestConversation();
      await sendGuestMessage(first, "one");

      const second = await startGuestConversation();
      const res = await sendGuestMessage(second, "two");

      expect(res.body.autoReplies).toHaveLength(0);
      expect(
        await Message.countDocuments({ conversationId: second, autoKind: "greeting" }),
      ).toBe(0);
    });

    it("keeps separate guests apart", async () => {
      const guestA = await startGuestConversation("guest-a-auto");
      await sendGuestMessage(guestA, "hi", "guest-a-auto");

      const guestB = await startGuestConversation("guest-b-auto");
      const res = await sendGuestMessage(guestB, "hi", "guest-b-auto");

      expect(res.body.autoReplies).toHaveLength(1);
      expect(res.body.autoReplies[0].autoKind).toBe("greeting");
    });

    it("fires once per registered account across conversations", async () => {
      const user = await createUser();
      const token = makeToken(user);

      const start = await request(app)
        .post("/api/support/conversations")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      await request(app)
        .post(`/api/support/conversations/${start.body.conversation._id}/messages`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "first" });

      const second = await request(app)
        .post("/api/support/conversations")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      const res = await request(app)
        .post(`/api/support/conversations/${second.body.conversation._id}/messages`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "second" });

      expect(res.body.autoReplies).toHaveLength(0);
    });
  });

  describe("keyword answers", () => {
    it("answers a withdraw question once per conversation", async () => {
      const convId = await startGuestConversation();

      const first = await sendGuestMessage(convId, "I want to Withdraw now");
      expect(first.body.autoReplies).toHaveLength(2);
      expect(first.body.autoReplies[1].autoKind).toBe("keyword");
      expect(first.body.autoReplies[1].autoKey).toBe("withdraw");

      const again = await sendGuestMessage(convId, "withdraw again please");
      expect(again.body.autoReplies).toHaveLength(0);
    });

    it("re-answers the same keyword in a new conversation", async () => {
      const first = await startGuestConversation();
      await sendGuestMessage(first, "withdraw?");

      // Greeting က သက်တမ်းတစ်ခါပဲ — ဒီ guest ရဲ့ ဒုတိယ conversation မှာ
      // keyword အဖြေတစ်ခုတည်း ထွက်ရမယ်။
      const second = await startGuestConversation();
      const res = await sendGuestMessage(second, "withdraw?");

      expect(res.body.autoReplies.map((m) => m.autoKey)).toEqual(["withdraw"]);
    });

    it("needs the full lucky order phrase and matches case-insensitively", async () => {
      const convId = await startGuestConversation();

      const luckyOnly = await sendGuestMessage(convId, "so LUCKY today");
      expect(luckyOnly.body.autoReplies).toHaveLength(1);
      expect(luckyOnly.body.autoReplies[0].autoKind).toBe("greeting");

      const luckyPhrase = await sendGuestMessage(convId, "my Lucky Order status");
      expect(luckyPhrase.body.autoReplies).toHaveLength(1);
      expect(luckyPhrase.body.autoReplies[0].autoKey).toBe("lucky order");
    });

    it("sends both answers when one message mentions both keywords", async () => {
      const convId = await startGuestConversation();
      const res = await sendGuestMessage(convId, "withdraw and lucky order?");

      expect(res.body.autoReplies.map((m) => m.autoKey)).toEqual([
        null,
        "withdraw",
        "lucky order",
      ]);
    });

    it("does not answer itself from the canned text already in the conversation", async () => {
      const convId = await startGuestConversation();
      await sendGuestMessage(convId, "withdraw?");

      // Canned answer ထဲ "withdraw" ပါနေတယ် — history ကို ပြန်မစစ်ရ။
      const plain = await sendGuestMessage(convId, "ok thanks");
      expect(plain.body.autoReplies).toHaveLength(0);

      expect(
        await Message.countDocuments({ conversationId: convId, autoKey: "withdraw" }),
      ).toBe(1);
    });
  });

  describe("admin state", () => {
    it("leaves unreadByAdmin set and keeps the question as the list preview", async () => {
      const convId = await startGuestConversation();
      await sendGuestMessage(convId, "how do I withdraw?");

      const conversation = await Conversation.findById(convId);
      expect(conversation.unreadByAdmin).toBe(true);
      expect(conversation.lastMessagePreview).toBe("how do I withdraw?");
      expect(conversation.lastMessageSender).toBe("customer");
    });

    it("does not count the auto reply as an unread customer message", async () => {
      const admin = await createUser("admin");
      const convId = await startGuestConversation();
      await sendGuestMessage(convId, "withdraw?");

      const res = await request(app)
        .get("/api/support/admin/conversations")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.conversations[0].unreadCountByAdmin).toBe(1);
    });
  });

  describe("copy", () => {
    it("keeps the client wording verbatim and English-only", () => {
      expect(GREETING_BODY).toBe(
        "Hello! Thank you for contacting Rakuten. What can I assist you with today?",
      );
      expect(KEYWORD_REPLIES.map((reply) => reply.key)).toEqual([
        "withdraw",
        "lucky order",
      ]);
      expect(KEYWORD_REPLIES[0].body).toBe(
        "Once all the orders in your account are completed, you can withdraw your funds Thank you for contacting Rakuten",
      );
      expect(KEYWORD_REPLIES[1].body).toBe(
        "Since the system automatically assigns a high commission for lucky orders, it cannot be canceled",
      );
    });
  });

  describe("closed conversation", () => {
    it("writes nothing because the send is rejected first", async () => {
      const convId = await startGuestConversation();
      await request(app)
        .post(`/api/support/conversations/${convId}/close`)
        .send({ guestId: GUEST_ID });

      const res = await sendGuestMessage(convId, "withdraw?");

      expect(res.status).toBe(409);
      expect(await Message.countDocuments({ conversationId: convId })).toBe(0);
    });
  });
});
