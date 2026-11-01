const User = require("../models/User");

// Owner က ကိုယ့် downline user တွေကိုသာ မြင်ရမယ် — ဒါက authorization boundary
// ဖြစ်လို့ scope query ကို တစ်နေရာတည်းမှာ ထားမယ် (controller ၃ ခု + service ၁ ခုမှာ
// copy အဖြစ် ပွားနေခဲ့တယ်)။
async function ownerUserIds(ownerId) {
  return User.find({ ownerId }).distinct("_id");
}

module.exports = { ownerUserIds };
