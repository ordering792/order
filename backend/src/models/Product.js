const mongoose = require("mongoose");
const { CATALOG_LIMITS } = require("../constants/catalogLimits");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: CATALOG_LIMITS.NAME,
    },

    // အမှတ်စဉ် — serial / product number shown on the order.
    code: {
      type: String,
      default: "",
      trim: true,
      maxlength: CATALOG_LIMITS.CODE,
    },

    // ပစ္စည်းအမျိုးအစား — product category.
    category: {
      type: String,
      default: "",
      trim: true,
      maxlength: CATALOG_LIMITS.CATEGORY,
    },

    // အသုံးပြုပုံ — how the item is used.
    usage: {
      type: String,
      default: "",
      maxlength: CATALOG_LIMITS.USAGE,
    },

    description: {
      type: String,
      default: "",
      maxlength: CATALOG_LIMITS.DESCRIPTION,
    },

    imageUrl: {
      type: String,
      default: null,
      maxlength: CATALOG_LIMITS.IMAGE_URL,
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
