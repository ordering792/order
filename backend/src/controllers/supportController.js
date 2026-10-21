const { z } = require("zod");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { emitToConversation, emitToAdmins } = require("../socket");

const startConversationSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  guestId: z.string().min(1).max(64).optional(),
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

const listQuerySchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function customerFilter(customer, id) {
  return customer.userId
    ? { _id: id, userId: customer.userId }
    : { _id: id, guestId: customer.guestId };
}

async function updateLastMessage(conversation, message) {
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
}

exports.startConversation = asyncHandler(async (req, res) => {
  const parsed = startConversationSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { subject } = parsed.data;

  // Resolve ownerId for registered users
  let ownerId = null;
  if (req.customer.userId) {
    const user = await User.findById(req.customer.userId).select("ownerId");
    ownerId = user?.ownerId || null;
  }

  const conversation = await Conversation.create({
    userId: req.customer.userId || null,
    guestId: req.customer.guestId || null,
    ownerId,
    subject: subject || "General Support",
    status: "open",
    unreadByAdmin: true,
    unreadByCustomer: false,
  });

  emitToAdmins("conversation:new", {
    conversationId: String(conversation._id),
    subject: conversation.subject,
    userId: conversation.userId ? String(conversation.userId) : null,
    guestId: conversation.guestId,
    ownerId: conversation.ownerId ? String(conversation.ownerId) : null,
    createdAt: conversation.createdAt,
  });

  res.status(201).json({ conversation });
});

exports.listMyConversations = asyncHandler(async (req, res) => {
  const filter = req.customer.userId
    ? { userId: req.customer.userId }
    : { guestId: req.customer.guestId };

  const conversations = await Conversation.find(filter).sort({
    lastMessageAt: -1,
    createdAt: -1,
  });

  res.json({ conversations });
});

exports.getConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const conversation = await Conversation.findOne(
    customerFilter(req.customer, id),
  );

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(200);

  res.json({ conversation, messages });
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const parsed = sendMessageSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const conversation = await Conversation.findOne(
    customerFilter(req.customer, id),
  );

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.status === "closed") {
    return res.status(409).json({ message: "Conversation is closed" });
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderType: "customer",
    userId: req.customer.userId || null,
    guestId: req.customer.guestId || null,
    body: parsed.data.body,
  });

  await updateLastMessage(conversation, message);

  emitToConversation(conversation._id, "message:new", {
    conversationId: String(conversation._id),
    message: {
      _id: message._id,
      senderType: message.senderType,
      body: message.body,
      createdAt: message.createdAt,
    },
  });

  emitToAdmins("conversation:updated", {
    conversationId: String(conversation._id),
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt,
    unreadByAdmin: conversation.unreadByAdmin,
  });

  res.status(201).json({ message });
});

exports.closeConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const conversation = await Conversation.findOne(
    customerFilter(req.customer, id),
  );

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  conversation.status = "closed";
  conversation.closedAt = new Date();
  conversation.closedBy = req.customer.userId || null;
  await conversation.save();

  emitToConversation(conversation._id, "conversation:closed", {
    conversationId: String(conversation._id),
  });

  emitToAdmins("conversation:updated", {
    conversationId: String(conversation._id),
    status: "closed",
  });

  res.json({ conversation });
});

exports.adminListConversations = asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const { status, search, page, limit } = parsed.data;
  const filter = {};

  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { subject: { $regex: search, $options: "i" } },
      { lastMessagePreview: { $regex: search, $options: "i" } },
    ];
  }

  // Owner sees only their users' conversations; admin sees all
  if (req.user.role === "owner") {
    filter.ownerId = req.user._id;
  }

  const total = await Conversation.countDocuments(filter);
  const conversations = await Conversation.find(filter)
    .populate("userId", "name phone")
    .populate("ownerId", "name phone")
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({ conversations, total, page, limit });
});

exports.adminGetConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const conversation = await Conversation.findById(id)
    .populate("userId", "name phone")
    .populate("ownerId", "name phone");

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  // Owner can only access their own users' conversations
  if (req.user.role === "owner") {
    if (
      !conversation.ownerId ||
      !conversation.ownerId._id.equals(req.user._id)
    ) {
      return res.status(404).json({ message: "Conversation not found" });
    }
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(200);

  res.json({ conversation, messages });
});

exports.adminSendMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const parsed = sendMessageSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.issues,
    });
  }

  const conversation = await Conversation.findById(id);

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  // Owner can only reply to their own users' conversations
  if (req.user.role === "owner") {
    if (!conversation.ownerId || !conversation.ownerId.equals(req.user._id)) {
      return res.status(404).json({ message: "Conversation not found" });
    }
  }

  if (conversation.status === "closed") {
    return res.status(409).json({ message: "Conversation is closed" });
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderType: "admin",
    userId: req.user._id,
    body: parsed.data.body,
  });

  await updateLastMessage(conversation, message);

  emitToConversation(conversation._id, "message:new", {
    conversationId: String(conversation._id),
    message: {
      _id: message._id,
      senderType: message.senderType,
      body: message.body,
      createdAt: message.createdAt,
    },
  });

  emitToAdmins("conversation:updated", {
    conversationId: String(conversation._id),
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt,
    unreadByAdmin: conversation.unreadByAdmin,
  });

  res.status(201).json({ message });
});

exports.adminCloseConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const conversation = await Conversation.findById(id);

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  conversation.status = "closed";
  conversation.closedAt = new Date();
  conversation.closedBy = req.user._id;
  await conversation.save();

  emitToConversation(conversation._id, "conversation:closed", {
    conversationId: String(conversation._id),
  });

  emitToAdmins("conversation:updated", {
    conversationId: String(conversation._id),
    status: "closed",
  });

  res.json({ conversation });
});

exports.adminReopenConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const conversation = await Conversation.findById(id);

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  conversation.status = "open";
  conversation.closedAt = null;
  conversation.closedBy = null;
  await conversation.save();

  emitToConversation(conversation._id, "conversation:reopened", {
    conversationId: String(conversation._id),
  });

  emitToAdmins("conversation:updated", {
    conversationId: String(conversation._id),
    status: "open",
  });

  res.json({ conversation });
});

exports.adminMarkRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  const conversation = await Conversation.findById(id);

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  conversation.unreadByAdmin = false;
  await conversation.save();

  await Message.updateMany(
    { conversationId: conversation._id, senderType: "customer", readAt: null },
    { readAt: new Date() },
  );

  res.json({ conversation });
});

exports.getOnlineStatus = asyncHandler(async (req, res) => {
  const {
    isUserOnline,
    isGuestOnline,
    onlineUsers,
    onlineGuests,
  } = require("../socket");

  res.json({
    totalOnline: onlineUsers.size + onlineGuests.size,
    onlineUsers: Array.from(onlineUsers.keys()),
    onlineGuests: Array.from(onlineGuests.keys()),
  });
});
