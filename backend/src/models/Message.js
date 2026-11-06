const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderType: {
      type: String,
      enum: ["customer", "admin"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    guestId: {
      type: String,
      default: null,
      maxlength: 64,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Auto reply တွေက senderType "admin" အတိုင်းဖြစ်လို့ CS bubble အဖြစ်ပဲ
    // ပေါ်တယ်။ ဒီ field ၂ ခုက "ဒါ လူမပို့တာ" ဆိုတာ သတ်မှတ်ပြီး duplicate
    // မပို့ဖို့ (greeting = identity အလိုက်, keyword = conversation အလိုက်)
    // နဲ့ admin unread ကို မပြောင်းအောင် ခွဲထုတ်ရာမှာ သုံးတယ်။
    autoKind: {
      type: String,
      enum: [null, "greeting", "keyword"],
      default: null,
    },
    autoKey: {
      type: String,
      default: null,
      maxlength: 40,
    },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ userId: 1, autoKind: 1 });
messageSchema.index({ guestId: 1, autoKind: 1 });

module.exports = mongoose.model("Message", messageSchema);
