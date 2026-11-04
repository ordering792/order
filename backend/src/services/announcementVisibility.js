// Announcement မြင်ရတဲ့ filter ကို တစ်နေရာမှာပဲ သတ်မှတ်တယ် — list endpoint နဲ့
// unread count နှစ်ခုသုံးတယ်၊ ခွဲရေးထားရင် တစ်ခု ပြင်ပြီး တစ်ခု မေ့လို့ ဒီ
// security boundary ပျက်နိုင်တယ်။
function visibleAnnouncementFilter(user) {
  // Admin က အားလုံးမြင်ရမယ် (ကိုယ်ပို့ထားတဲ့ စာတွေကို ပြန်စစ်ဖို့)။
  if (user?.role === "admin") return {};

  // ကျန် role က broadcast နဲ့ ကိုယ့်ဆီရောက်တဲ့ စာပဲ။ recipientId: null က
  // field လုံးဝ မပါတဲ့ အဟောင်း broadcast row တွေကိုပါ ကိုင်တယ်။
  return { $or: [{ recipientId: null }, { recipientId: user._id }] };
}

module.exports = { visibleAnnouncementFilter };
