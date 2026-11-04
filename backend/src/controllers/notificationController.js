const Announcement = require("../models/Annoncement");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const {
  visibleAnnouncementFilter,
} = require("../services/announcementVisibility");

// Home က notification badge ရဲ့ "အသစ်" = ဒီ account မှာ notificationsSeenAt
// ထက်နောက်ပိုင်း မွေးတဲ့ item တွေ။ Notifications page ထဲ ပြတဲ့ feed (စာ +
// ကိုယ့် transaction) နဲ့ အတူတူပဲ ရေတွက်တယ် — badge က 1 ပြပြီး page မှာ
// 5 စား ဆိုရင် သုံးသူ ရှုပ်တယ်။
// Transaction.type enum က deposit/withdraw သားဖြစ်လို့ type filter မလိုဘူး။
// seenAt မရှိသေးသူ = ဘယ်တော့မှ မဖတ်သေးလို့ အားလုံး အသစ်။
exports.unreadCount = asyncHandler(async (req, res) => {
  const { notificationsSeenAt: seenAt } = req.user;
  const createdAfter = seenAt ? { createdAt: { $gt: seenAt } } : {};

  const [announcements, transactions] = await Promise.all([
    Announcement.countDocuments({
      ...visibleAnnouncementFilter(req.user),
      ...createdAfter,
    }),
    Transaction.countDocuments({
      userId: req.user._id,
      ...createdAfter,
    }),
  ]);

  res.json({ count: announcements + transactions });
});

// Page ဝင်ပြီးတဲ့ အချိန်ကိုပဲ စားတယ် — item တစ်ခုချင်း read state မသိမ်းဘူး။
// Server clock နဲ့ မွေးတဲ့ createdAt ကို နှိုင်းယှဉ်တာမို့ client time ပြောင်းတာက
// badge ကို မထိဘူး။
exports.markSeen = asyncHandler(async (req, res) => {
  await User.updateOne(
    { _id: req.user._id },
    { $set: { notificationsSeenAt: new Date() } },
  );

  res.json({ count: 0 });
});
