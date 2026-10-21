const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    guestId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    subject: {
      type: String,
      default: "General Support",
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: null,
      maxlength: 200,
    },
    lastMessageSender: {
      type: String,
      enum: ["customer", "admin"],
      default: null,
    },
    unreadByAdmin: {
      type: Boolean,
      default: true,
    },
    unreadByCustomer: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ status: 1, lastMessageAt: -1 });
conversationSchema.index({ userId: 1, createdAt: -1 });
conversationSchema.index({ guestId: 1, createdAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
