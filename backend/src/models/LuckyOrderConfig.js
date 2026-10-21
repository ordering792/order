const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 40,
    },

    requiredDeposit: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    extraCommission: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: "0.00",
    },
  },
  { timestamps: true },
);

schema.index({ userId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model("LuckyOrderConfig", schema);
