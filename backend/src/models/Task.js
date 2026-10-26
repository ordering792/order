const mongoose = require("mongoose");

const MAX_ORDER_NUMBER = 500;

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderPlan",
      default: null,
      index: true,
    },

    orderNumber: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_ORDER_NUMBER,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    imageUrl: {
      type: String,
      default: null,
    },

    code: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      default: "",
    },

    usage: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    price: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    commission: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: "0.00",
    },

    isLuckyOrder: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["available", "assigned", "completed"],
      default: "available",
    },

    // Match လုပ်တဲ့အချိန် (order ကို user အတွက် reserve လုပ်တာ)
    assignedAt: {
      type: Date,
      default: null,
    },

    // User က "Submit Order" နိုင်တဲ့အချိန်
    submittedAt: {
      type: Date,
      default: null,
    },

    // Product rating (1-5) + feedback comment
    rating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },

    feedback: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// orderNumber က plan အတွင်းမှာပဲ unique — user တစ်ယောက်က plan အသစ်
// (round ၂) စရင် orderNumber ၁ ပြန်ထပ်တယ်။ (userId, orderNumber) တင်
// unique ဆက်ထားရင် generate သား E11000 နဲ့ ပျက်မယ်။
taskSchema.index({ userId: 1, orderPlanId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model("Task", taskSchema);
