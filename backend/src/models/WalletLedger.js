const mongoose = require("mongoose");

const walletLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    balance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },

    reference: {
      type: String,
      default: null,
    },

    note: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WalletLedger", walletLedgerSchema);
