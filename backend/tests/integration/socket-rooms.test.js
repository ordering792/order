const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../../src/models/User");
const Conversation = require("../../src/models/Conversation");

// socket.io ကို fake လုပ်ပြီး connection handler + socket.join ကို ဖမ်းတယ်။
// Room membership ဆိုတာ socket.io အတွင်းပိုင်း ဖြစ်လို့ join() ခေါ်တဲ့ အချက်ကိုပဲ
// စစ်တယ် — ဒါက message:new ရောက်ဖို့ လိုအပ်တဲ့ တစ်ခုတည်းသော အဆင့်။
jest.mock("socket.io", () => {
  const handlers = {};

  return {
    Server: jest.fn(() => ({
      use: jest.fn(),
      on: jest.fn((event, fn) => {
        handlers[event] = fn;
      }),
      to: jest.fn(() => ({ emit: jest.fn() })),
      emit: jest.fn(),
      close: jest.fn(),
    })),
    __handlers: handlers,
  };
});

const { __handlers: handlers } = require("socket.io");
const { setupSocket } = require("../../src/socket");

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
  setupSocket({ on: jest.fn() });
});

async function createUser(role = "user") {
  const passwordHash = await bcrypt.hash("password123", 10);
  return User.create({
    name: `${role} tester`,
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

function connectSocket({ userId = null, guestId = null, role = "user" }) {
  const listeners = {};

  const socket = {
    id: `socket-${Math.random()}`,
    data: { userId: userId ? String(userId) : null, guestId, role },
    joins: [],
    listeners,
    join: jest.fn((room) => socket.joins.push(room)),
    leave: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    on: jest.fn((event, fn) => {
      listeners[event] = fn;
    }),
  };

  handlers.connection(socket);
  return socket;
}

async function joinRoom(socket, conversationId) {
  const callback = jest.fn();
  await socket.listeners["conversation:join"](conversationId, callback);
  return callback;
}

describe("conversation room membership", () => {
  it("lets the owner of a conversation join its room", async () => {
    const customer = await createUser("user");
    const conversation = await Conversation.create({
      userId: customer._id,
      subject: "Help",
    });

    const socket = connectSocket({ userId: customer._id });
    const callback = await joinRoom(socket, String(conversation._id));

    expect(callback).toHaveBeenCalledWith({ ok: true });
    expect(socket.joins).toContain(`conv:${conversation._id}`);
  });

  it("lets a signed-in guest join its own room", async () => {
    const conversation = await Conversation.create({
      guestId: "guest-abc",
      subject: "Help",
    });

    const socket = connectSocket({ guestId: "guest-abc" });
    const callback = await joinRoom(socket, String(conversation._id));

    expect(callback).toHaveBeenCalledWith({ ok: true });
    expect(socket.joins).toContain(`conv:${conversation._id}`);
  });

  it("lets an admin join any conversation room to receive message:new", async () => {
    const customer = await createUser("user");
    const admin = await createUser("admin");
    const conversation = await Conversation.create({
      userId: customer._id,
      subject: "Help",
    });

    const socket = connectSocket({ userId: admin._id, role: "admin" });
    const callback = await joinRoom(socket, String(conversation._id));

    expect(callback).toHaveBeenCalledWith({ ok: true });
    expect(socket.joins).toContain(`conv:${conversation._id}`);
  });

  it("still refuses a stranger customer, IDOR card unchanged", async () => {
    const owner = await createUser("user");
    const stranger = await createUser("user");
    const conversation = await Conversation.create({
      userId: owner._id,
      subject: "Help",
    });

    const socket = connectSocket({ userId: stranger._id });
    const callback = await joinRoom(socket, String(conversation._id));

    expect(callback).toHaveBeenCalledWith({ error: "Conversation not found" });
    expect(socket.joins).not.toContain(`conv:${conversation._id}`);
  });

  it("keeps owners out of the rooms because their scoping is per-user", async () => {
    const customer = await createUser("user");
    const owner = await createUser("owner");
    const conversation = await Conversation.create({
      userId: customer._id,
      subject: "Help",
    });

    const socket = connectSocket({ userId: owner._id, role: "owner" });
    const callback = await joinRoom(socket, String(conversation._id));

    expect(callback).toHaveBeenCalledWith({ error: "Conversation not found" });
    expect(socket.joins).not.toContain(`conv:${conversation._id}`);
  });

  it("refuses an admin request for a conversation that does not exist", async () => {
    const admin = await createUser("admin");
    const socket = connectSocket({ userId: admin._id, role: "admin" });

    const missing = new mongoose.Types.ObjectId();
    const callback = await joinRoom(socket, String(missing));
    expect(callback).toHaveBeenCalledWith({ error: "Conversation not found" });

    const callback2 = await joinRoom(socket, "not-an-object-id");
    expect(callback2).toHaveBeenCalledWith({ error: "Conversation not found" });
    expect(socket.joins.some((room) => room.startsWith("conv:"))).toBe(false);
  });

  it("stops a non-admin socket from joining with a raw ObjectId", async () => {
    const customer = await createUser("user");
    const conversation = await Conversation.create({
      userId: customer._id,
      subject: "Help",
    });

    const socket = connectSocket({ userId: customer._id });
    // ObjectId object မဟုတ်ဘဲ string မဟုတ်တဲ့ input — client payload ကို
    // ဘယ်တော့မှ မယုံဘူး။
    const callback = await joinRoom(socket, conversation._id);

    expect(callback).toHaveBeenCalledWith({ error: "Conversation not found" });
  });
});
