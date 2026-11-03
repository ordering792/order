const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["deposit", "withdraw"],
      required: true,
    },

    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    proofScreenshot: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    // Lucky order တွေအတွက် သုံးပြီးသားပမာဏ။ amount − appliedAmount က
    // နောက် lucky order တစ်ခုအတွက် ကျန်နေသေးတဲ့ deposit ဖြစ်တယ်။
    appliedAmount: {
      type: mongoose.Schema.Types.Decimal128,
      default: "0.00",
    },

    // Set when part or all of an accepted deposit is claimed to pay a lucky
    // order deposit.
    allocation: {
      type: new mongoose.Schema(
        {
          taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            default: null,
          },
          allocatedAt: {
            type: Date,
            default: null,
          },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", schema);
