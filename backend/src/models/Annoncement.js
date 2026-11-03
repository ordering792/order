const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // recipientId = တစ်ယောက်ချင်း ပို့တဲ့ စာရဲ့ လက်ခံသူ (null = broadcast)။
    // userId အပေါ်ကကတော့ ရေးသားတဲ့ admin — နှစ်ခု မရောအောင် နာမည် ခွဲထားတယ်။
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    content: {
      type: String,
      required: true,
      maxlength: 10000,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Announcement", schema);
