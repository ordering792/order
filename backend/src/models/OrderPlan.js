const mongoose = require("mongoose");

const luckyPositionSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    // productId မထည့်ရင် order ဖန်တီးတဲ့အခါ deposit အလိုက် အစဉ်အလိုက် product ကို
    // backend က အလိုအလျောက် ရွေးပေးမယ်။
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false,
      default: null,
    },

    requiredDeposit: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: "0.00",
    },

    luckyCommission: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
  },
  { _id: false },
);

const orderPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // User တစ်ယောက်က plan အများရှိနိုင်တယ် (round ၂၊ ၃ …) — အရင် plan ပြီးတဲ့အခါမှ အသစ်ဖန်တီးလို့။
      index: true,
    },

    totalOrders: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    status: {
      type: String,
      enum: ["draft", "generated", "completed"],
      default: "draft",
    },

    initialDeposit: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },

    initialDepositTxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    currentBase: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },

    completedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    luckyPositions: {
      type: [luckyPositionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("OrderPlan", orderPlanSchema);
