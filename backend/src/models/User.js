const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: "0.00",
    },

    walletAddress: {
      type: String,
      default: null,
    },

    cryptoAddress: {
      type: String,
      default: null,
      trim: true,
    },

    // Admin / Owner ရဲ့ payout QR code (image URL သို့ data URL)။
    cryptoQrUrl: {
      type: String,
      default: null,
      maxlength: 2000,
    },

    invitationCode: {
      type: String,
      required: true,
      unique: true,
    },

    referredByCode: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["online", "offline", "burned"],
      default: "offline",
    },

    role: {
      type: String,
      enum: ["user", "owner", "admin"],
      default: "user",
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    ownerInviteCode: {
      type: String,
      default: undefined,
      unique: true,
      sparse: true,
    },

    language: {
      type: String,
      enum: ["en", "es", "pt", "ar", "hi", "ja", "th", "ko", "zh"],
      default: "en",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
