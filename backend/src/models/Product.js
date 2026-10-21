const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    // အမှတ်စဉ် — serial / product number shown on the order.
    code: {
      type: String,
      default: "",
      trim: true,
      maxlength: 50,
    },

    // ပစ္စည်းအမျိုးအစား — product category.
    category: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },

    // အသုံးပြုပုံ — how the item is used.
    usage: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    imageUrl: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    price: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    // Display only — order payout always recomputed as price x 0.5%.
    commission: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },
  },
  { timestamps: true },
);

productSchema.index({ price: 1 });
productSchema.index({ code: 1 });

module.exports = mongoose.model("Product", productSchema);
