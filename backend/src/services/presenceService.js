// Presence window — list တွေမှာ Online လို့ ပြဖို့ lastSeenAt နှိုင်းယှဉ်တဲ့ အချိန်။
// auth middleware ရဲ့ ၆၀ စက္ကန့် throttle ထက် ကျယ်ရမယ် (မဟုတ်ရင် window အစောပိုင်း
// မှာပဲ offline ပြသွားမယ်)။
const ONLINE_WINDOW_MS = 5 * 60_000;

// Burned က အမြဲ အောက်ဆုံး — admin က status ကို Burn အလံအဖြစ်ပဲ သုံးလို့။
function isOnline(user) {
  if (user.status === "burned" || !user.lastSeenAt) return false;

  return Date.now() - new Date(user.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
}

module.exports = { ONLINE_WINDOW_MS, isOnline };
