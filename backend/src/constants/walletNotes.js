// WalletLedger.note ကို profit stat တွေမှာ $match query key အဖြစ် သုံးတယ်။
// စာလုံးပေါင်း အနည်းငယ်ထွေရင် ရေးသင့်တဲ့နေရာနဲ့ ဖတ်သင့်တဲ့နေရာ မကိုက်တော့ဘူး —
// stat က သေသေချာချာ မပြဘဲ သုည ဖြစ်သွားမယ်။
const WALLET_NOTES = {
  TASK_COMMISSION: "Task commission",
  REFERRAL_BONUS: "Referral bonus",
  LUCKY_ORDER_DEPOSIT: "Lucky order deposit",
  // Admin က balance ကို လက်ဖြင့် ညှိတဲ့ entry — profit stat ($match note) တွေမှာ
  // commission မရေတွက်ခံရအောင် သီးသန့် value သုံးတယ်။
  ADMIN_ADJUST: "Admin adjustment",
};

module.exports = { WALLET_NOTES };
