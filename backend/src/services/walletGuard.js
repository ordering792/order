const bcrypt = require("bcryptjs");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { normalizePassword } = require("../utils/phone");

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

// Admin/owner ရဲ့ payout လိပ်စာက အဖြေထုတ်တဲ့ဆီ ပိုက်ဆံသွားတဲ့ field ဖြစ်လို့
// JWT ရှိရုံနဲ့ ပြောင်းလို့ရနေရင် token တစ်ခါခိုးရုံနဲ့ withdraw ပို့နေကျ
// address ကို အလွယ်တကူ လှည့်လိုက်လို့ရတယ်။ ဒါကြောင့် ဒီ account type တွေ
// အတွက် login password ကို ထပ်စစ်တယ် (withdraw လမ်းကြောင်းနဲ့ တစ်စည်းတစ်လက်)။
const PASSWORD_REQUIRED_MESSAGE =
  "Your login password is required to change this wallet address";
const INCORRECT_PASSWORD_MESSAGE = "Incorrect password";

// Admin နဲ့ owner account တွေရဲ့ payout address — customer app က
// /auth/wallet-address ကနေ ဒီ gate ကို လှော်ခတ်လို့ မရအောင် ဒီ endpoint ကို
// admin panel ကနေပဲ ပြောင်းခိုင်းတယ် (admin panel က password တောင်းတယ်)။
const PAYOUT_ACCOUNT_MESSAGE =
  "Admin and owner payout addresses are changed from the admin panel";

function isPayoutAccount(user) {
  return user?.role === "admin" || user?.role === "owner";
}

// 401 သုံးလို့ မရဘူး — client.ts က 401 တွင် session ကို ရှင်းပြီး user ကို
// logout လုပ်ချလိုက်တယ်။ Password မှားတဲ့ admin ကိုယ်တိုင်ပါ ထုတ်ခံရမယ်။
async function confirmLoginPassword(userId, password) {
  const candidate = normalizePassword(password);

  if (!candidate) {
    return { ok: false, status: 400, message: PASSWORD_REQUIRED_MESSAGE };
  }

  const account = await User.findById(userId).select("+passwordHash");

  if (!account) {
    return { ok: false, status: 409, message: "User unavailable" };
  }

  const valid = await bcrypt.compare(candidate, account.passwordHash);

  return valid
    ? { ok: true }
    : { ok: false, status: 400, message: INCORRECT_PASSWORD_MESSAGE };
}

module.exports = {
  PENDING_WITHDRAWAL_MESSAGE,
  PASSWORD_REQUIRED_MESSAGE,
  INCORRECT_PASSWORD_MESSAGE,
  PAYOUT_ACCOUNT_MESSAGE,
  hasPendingWithdrawal,
  isPayoutAccount,
  confirmLoginPassword,
};
