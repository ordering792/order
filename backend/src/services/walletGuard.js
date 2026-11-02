const Transaction = require("../models/Transaction");

// Withdraw request တစ်ခု pending လှမ်းနေစဉ်မှာ admin approve မလုပ်ခင်
// User.walletAddress ကို live ဖတ်နေတယ် (Transaction ထဲ address snapshot
// မထား) — ဒါကြောင့် address ပြောင်းရင် pending request က ပတ်ဝန်းကျင်ပြောင်း
// သွားတယ်။ User/admin နှစ်ဖက်လုံး အဲဒီအခွင့် မပေးတော့ဘူး။
const PENDING_WITHDRAWAL_MESSAGE =
  "Resolve the pending withdrawal before changing the wallet address";

async function hasPendingWithdrawal(userId) {
  const found = await Transaction.exists({
    userId,
    type: "withdraw",
    status: "pending",
  });

  return Boolean(found);
}

module.exports = { PENDING_WITHDRAWAL_MESSAGE, hasPendingWithdrawal };
