const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    // Admin က password reset လုပ်တဲ့အခါ +1 တက်တယ်။ token ထဲက tv နဲ့
    // မကိုက်ရင် auth middleware က 401 ပြန်တယ် — device အားလုံး ချက်ချင်း ထွက်သွားအောင်။
    tokenVersion: {
      type: Number,
      default: 0,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Raw User-Agent ကိုပဲ သိမ်းမယ် — display label ကို admin list မှာ
    // deviceInfo() နဲ့ ချက်ချင်း တွက်တယ် (UA schema ပြောင်းရင် data မပျက်အောင်)။
    lastUserAgent: {
      type: String,
      default: null,
      maxlength: 300,
    },

    // License ကို ပထမဆုံး အတည်ပြုတဲ့ အချိန် + အထောက်အထား။ နောက်ထပ် ခေါ်ရင်လည်း
    // မူလ timestamp ကို မထိဘူး — တရားဝင် မှတ်တမ်းက ပထမ အကြိမ်ပဲ။
    licenseAcceptedAt: {
      type: Date,
      default: null,
    },

    licenseIpAddress: {
      type: String,
      default: null,
    },

    licenseUserAgent: {
      type: String,
      default: null,
      maxlength: 300,
    },

    balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: "0.00",
    },

    walletAddress: {
      type: String,
      default: null,
    },

    cryptoAddress: {
      type: String,
      default: null,
      trim: true,
    },

    // Admin / Owner ရဲ့ payout QR code (image URL သို့ data URL)။
    cryptoQrUrl: {
      type: String,
      default: null,
      maxlength: 2000,
    },

    invitationCode: {
      type: String,
      required: true,
      unique: true,
    },

    referredByCode: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["online", "offline", "burned"],
      default: "offline",
    },

    role: {
      type: String,
      enum: ["user", "owner", "admin"],
      default: "user",
    },

    // Admin သီးသန့် မှတ်စု (user တစ်ယောက်ချင်းစီ)။ select: false ကြောင့် owner/customer
    // ဆီ သွားတဲ့ response တွေမှာ ဘယ်တော့မှ မပါ — admin user list ကပဲ +adminNote နဲ့
    // တိုက်ရိုက် တောင်းတယ်။
    adminNote: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      select: false,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    ownerInviteCode: {
      type: String,
      default: undefined,
      unique: true,
      sparse: true,
    },

    // "hi" ကို picker (config/languages.js) ကနေ ဖြုတ်ပြီးပြီ၊ ဒါပေမဲ့ enum ထဲမှာ
    // ချန်ထားသေးတယ် — အဟောင်း row တွေမှာ language: "hi" ရှိနေရင် login တိုင်း
    // user.save() က ValidationError ဖြစ်ပြီး အကောင့်ဝင်လို့ မရတော့ဘူးလို့။
    language: {
      type: String,
      enum: ["en", "es", "pt", "ar", "hi", "ja", "th", "ko", "zh"],
      default: "en",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
