const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const onlineUsers = new Map();
const onlineGuests = new Map();

async function authenticate(socket, next) {
  const { token, guestId } = socket.handshake.auth || {};

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const User = require("../models/User");

      // JWT ထဲက role ကို တိုက်ရိုက်မယုံဘူး — authMiddleware လိုပဲ DB ကနေ
      // ပြန်ဖတ်တယ်။ မဟုတ်ရင် burned/demote လုပ်ပြီး user က token ပျက်သည်
      // အထိ real-time access ဆက်ရမယ်။
      const user = await User.findById(payload.userId).select("role status");

      if (!user || user.status === "burned") {
        return next(new Error("Account unavailable"));
      }

      socket.data.userId = payload.userId;
      socket.data.role = user.role;
      socket.data.guestId = null;
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  }

  if (guestId && typeof guestId === "string" && guestId.length <= 64) {
    socket.data.userId = null;
    socket.data.guestId = guestId;
    return next();
  }

  return next(new Error("Authentication required"));
}

function setupSocket(httpServer) {
  const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin:
        allowedOrigins.length > 0
          ? allowedOrigins
          : process.env.CLIENT_ORIGIN || false,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.use(authenticate);

  io.on("connection", (socket) => {
    const { userId, guestId, role } = socket.data;

    const Conversation = require("../models/Conversation");

    // senderType က client payload ကနေ မယူဘူး — handshake JWT ထဲက role ကနေပဲ
    // ဆုံးဖြတ်တယ်။ သူ့မဟုတ်ရင် customer က "admin" ပို့ပြီး message ဖြည့်စွက်လို့ ရଯায়။
    const senderTypeFor = () => (role === "admin" ? "admin" : "customer");

    // ဒီ conversation က သူ့/သူမိသားကပဲ ဖြစ်မှ ဝင်ခွင့်ရမယ်။
    const ownsConversation = async (conversationId) => {
      if (typeof conversationId !== "string") return false;

      const filter = userId
        ? { _id: conversationId, userId }
        : { _id: conversationId, guestId };

      const conversation = await Conversation.findOne(filter).select("_id");
      return Boolean(conversation);
    };

    // Track online status
    if (userId) {
      onlineUsers.set(String(userId), { socketId: socket.id, role });
      // ကိုယ့် order events (match / submit / complete) ကို real-time လက်ခံဖို့
      socket.join(`user:${String(userId)}`);
    }
    if (guestId) {
      onlineGuests.set(guestId, socket.id);
    }

    // Notify admin that a customer is online
    if (userId || guestId) {
      io.to("admins").emit("user:online", {
        userId: userId ? String(userId) : null,
        guestId: guestId || null,
        online: true,
      });
    }

    // Admin joins admin room
    if (role === "admin") {
      socket.join("admins");
      socket.to("admins").emit("admin:online", {
        userId: String(userId),
        online: true,
      });
    }

    // Join a conversation room — အဲဒီ conversation က သူ့/သူမိသားကပဲ ဖြစ်မှ ဝင်ခွင့်ရမယ် (IDOR ကား)
    socket.on("conversation:join", async (conversationId, callback) => {
      if (!(await ownsConversation(conversationId))) {
        if (callback) callback({ error: "Conversation not found" });
        return;
      }

      socket.join(`conv:${conversationId}`);
      if (callback) callback({ ok: true });
    });

    // Leave a conversation room
    socket.on("conversation:leave", (conversationId) => {
      if (typeof conversationId === "string") {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // Typing indicator
    socket.on("typing:start", async ({ conversationId }) => {
      if (!(await ownsConversation(conversationId))) return;

      socket.to(`conv:${conversationId}`).emit("typing:start", {
        conversationId,
        senderType: senderTypeFor(),
      });
    });

    socket.on("typing:stop", async ({ conversationId }) => {
      if (!(await ownsConversation(conversationId))) return;

      socket.to(`conv:${conversationId}`).emit("typing:stop", {
        conversationId,
        senderType: senderTypeFor(),
      });
    });

    // Send message via socket (alternative to REST)
    socket.on(
      "message:send",
      async ({ conversationId, body }, callback) => {
        if (typeof conversationId !== "string" || typeof body !== "string") {
          if (callback) callback({ error: "Invalid payload" });
          return;
        }

        try {
          const Conversation = require("../models/Conversation");
          const Message = require("../models/Message");

          const filter = userId
            ? { _id: conversationId, userId }
            : { _id: conversationId, guestId };

          const conversation = await Conversation.findOne(filter);
          if (!conversation) {
            if (callback) callback({ error: "Conversation not found" });
            return;
          }

          if (conversation.status === "closed") {
            if (callback) callback({ error: "Conversation is closed" });
            return;
          }

          const message = await Message.create({
            conversationId: conversation._id,
            senderType: senderTypeFor(),
            userId: userId || null,
            guestId: guestId || null,
            body: body.slice(0, 5000),
          });

          const preview =
            message.body.length > 200
              ? `${message.body.slice(0, 200)}...`
              : message.body;

          if (message.senderType === "admin") {
            conversation.unreadByCustomer = true;
            conversation.unreadByAdmin = false;
          } else {
            conversation.unreadByAdmin = true;
            conversation.unreadByCustomer = false;
          }
          conversation.lastMessageAt = message.createdAt;
          conversation.lastMessagePreview = preview;
          conversation.lastMessageSender = message.senderType;
          await conversation.save();

          io.to(`conv:${conversationId}`).emit("message:new", {
            conversationId,
            message: {
              _id: message._id,
              senderType: message.senderType,
              body: message.body,
              createdAt: message.createdAt,
            },
          });

          io.to("admins").emit("conversation:updated", {
            conversationId,
            lastMessagePreview: preview,
            lastMessageAt: message.createdAt,
            unreadByAdmin: conversation.unreadByAdmin,
          });

          if (callback) callback({ message });
        } catch (err) {
          // internal message ကို client မပို့ဘူး — server log မှာပဲ ထားမယ်။
          console.error("message:send failed:", err);
          if (callback) callback({ error: "Message could not be sent" });
        }
      },
    );

    // Disconnect
    socket.on("disconnect", () => {
      if (userId) {
        onlineUsers.delete(String(userId));
        if (role === "admin") {
          socket.to("admins").emit("admin:online", {
            userId: String(userId),
            online: false,
          });
        }
      }
      if (guestId) {
        onlineGuests.delete(guestId);
      }

      if (userId || guestId) {
        io.to("admins").emit("user:online", {
          userId: userId ? String(userId) : null,
          guestId: guestId || null,
          online: false,
        });
      }
    });
  });

  return io;
}

function getIO() {
  return global.__IO__;
}

function emitToConversation(conversationId, event, payload) {
  const io = global.__IO__;
  if (io) {
    io.to(`conv:${conversationId}`).emit(event, payload);
  }
}

function emitToAdmins(event, payload) {
  const io = global.__IO__;
  if (io) {
    io.to("admins").emit(event, payload);
  }
}

// လက်တစ်ယောက်ကိုသာ event ပို့ခြင်း (order counts real-time update အတွက်)
function emitToUser(userId, event, payload) {
  const io = global.__IO__;
  if (io) {
    io.to(`user:${String(userId)}`).emit(event, payload);
  }
}

function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}

function isGuestOnline(guestId) {
  return onlineGuests.has(guestId);
}

module.exports = {
  setupSocket,
  getIO,
  emitToConversation,
  emitToAdmins,
  emitToUser,
  isUserOnline,
  isGuestOnline,
  onlineUsers,
  onlineGuests,
};
