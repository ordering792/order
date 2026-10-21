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
      enum: ["pending", "completed"],
      default: "pending",
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, orderNumber: 1 }, { unique: true });

module.exports = mongoose.model("Task", taskSchema);
