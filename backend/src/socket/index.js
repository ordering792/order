const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const onlineUsers = new Map();
const onlineGuests = new Map();

function authenticate(socket, next) {
  const { token, guestId } = socket.handshake.auth || {};

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role || "user";
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
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || false,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.use(authenticate);

  io.on("connection", (socket) => {
    const { userId, guestId, role } = socket.data;

    const Conversation = require("../models/Conversation");

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
    socket.on("typing:start", async ({ conversationId, senderType }) => {
      if (!(await ownsConversation(conversationId))) return;

      socket.to(`conv:${conversationId}`).emit("typing:start", {
        conversationId,
        senderType,
      });
    });

    socket.on("typing:stop", async ({ conversationId, senderType }) => {
      if (!(await ownsConversation(conversationId))) return;

      socket.to(`conv:${conversationId}`).emit("typing:stop", {
        conversationId,
        senderType,
      });
    });

    // Send message via socket (alternative to REST)
    socket.on(
      "message:send",
      async ({ conversationId, body, senderType }, callback) => {
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
            senderType: senderType === "admin" ? "admin" : "customer",
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
          if (callback) callback({ error: err.message });
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
  isUserOnline,
  isGuestOnline,
  onlineUsers,
  onlineGuests,
};
