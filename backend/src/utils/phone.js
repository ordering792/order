// Phone number တွေကို ရိုက်ထည့်တဲ့အခါ space/dash ပါနေတတ်တယ်။
// နောက်တွင်း တူညီအောင် normalize လုပ်ပေးတယ် (မှားလို့ "Invalid phone or password"
// ကြောင့် user က ဘာမှမသိမ်းဖြစ်စေတာမို့)။
function normalizePhone(value) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return trimmed;
  return hasPlus ? `+${digits}` : digits;
}

function normalizePassword(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = { normalizePhone, normalizePassword };
