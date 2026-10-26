// User ထဲက ရေးတဲ့ search string ကို regex pattern အဖြစ် တိုက်ရိုက်မသုံးဘူး —
// "(a+)+B" လို type က ReDoS ဖြစ်ပြီး server ကို ချောင့်စေတယ်။
function escapeRegExp(input) {
  return String(input).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegExp };
