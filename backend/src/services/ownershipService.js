const User = require("../models/User");

// Owner က ကိုယ့် downline user တွေကိုသာ မြင်ရမယ် — ဒါက authorization boundary
// ဖြစ်လို့ scope query ကို တစ်နေရာတည်းမှာ ထားမယ် (controller ၃ ခု + service ၁ ခုမှာ
// copy အဖြစ် ပွားနေခဲ့တယ်)။
async function ownerUserIds(ownerId) {
  return User.find({ ownerId }).distinct("_id");
}

// တစ်ကြိမ်ချင်း action (password reset, balance adjust, wallet address) အတွက်
// ဒဿမ version — owner က ကိုယ့် downline user (role=user) ကိုသာ ထိနိုင်တယ်။
// Admin actor ဆို ဘယ်တော့မှ မထိဘူး (false)၊ target က owner/admin row, ownerId
// မပါ user ဒါမှမဟုတ် အခြား owner ရဲ့ user ဆို true (ပိတ်)။
function isOutsideOwnerScope(actor, target) {
  if (actor?.role !== "owner") return false;

  return (
    target?.role !== "user" ||
    !target.ownerId ||
    !target.ownerId.equals(actor._id)
  );
}

module.exports = { ownerUserIds, isOutsideOwnerScope };
