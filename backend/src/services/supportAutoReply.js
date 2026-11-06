const Message = require("../models/Message");

// Client စာသားအတိုင်း verbatim — hardcoded အင်္ဂလိပ်တည်း (ruling 2026-11-06)။
// Locale file တွေ မထိဘူး၊ စာသားပြောင်းရင် deploy ပဲ။
const GREETING_BODY =
  "Hello! Thank you for contacting Rakuten. What can I assist you with today?";

const KEYWORD_REPLIES = [
  {
    key: "withdraw",
    body: "Once all the orders in your account are completed, you can withdraw your funds Thank you for contacting Rakuten",
  },
  {
    key: "lucky order",
    body: "Since the system automatically assigns a high commission for lucky orders, it cannot be canceled",
  },
];

// Auto reply စာသားတွေထဲ "withdraw" / "lucky order" ကိုယ်တိုင် ပါနေတယ်။
// ဒါကြောင့် ဒီ function က အခုပို့တဲ့ customer body တစ်ခုတည်းကိုပဲ စစ်တယ် —
// history ကို စစ်မိရင် bot စာထဲက keyword ကို bot ကိုယ်တိုင် ပြန်ဖြေပြီး loop ဖြစ်မယ်။
async function planAutoReplies({ conversation, body, userId, guestId }) {
  const planned = [];
  const lowerBody = body.toLowerCase();

  // Greeting = identity တစ်ယောက်ချင်း သက်တမ်းတစ်လျှောက် တစ်ခါ။
  // Identity မရှိရင် query က auto greeting အကုန်ကို match သွားလို့ လုံးဝမစစ်ဘူး။
  const identity = userId ? { userId } : guestId ? { guestId } : null;

  if (
    identity &&
    !(await Message.exists({ ...identity, autoKind: "greeting" }))
  ) {
    planned.push({ autoKind: "greeting", autoKey: null, body: GREETING_BODY });
  }

  for (const reply of KEYWORD_REPLIES) {
    if (!lowerBody.includes(reply.key)) {
      continue;
    }

    const alreadySent = await Message.exists({
      conversationId: conversation._id,
      autoKind: "keyword",
      autoKey: reply.key,
    });

    if (!alreadySent) {
      planned.push({
        autoKind: "keyword",
        autoKey: reply.key,
        body: reply.body,
      });
    }
  }

  return planned;
}

module.exports = { GREETING_BODY, KEYWORD_REPLIES, planAutoReplies };
