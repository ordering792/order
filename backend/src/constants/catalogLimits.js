// Admin catalog တွေမှာ Amazon/Walmart listing title တွေကို ကူးထည့်တယ် —
// limit က အဲဒီစာသား ဝင်နိုင်လောက်အောင် ကျယ်ဖို့လိုတယ်။ Zod schema နဲ့ Mongoose
// model က ဒီဂဏန်းတွေကို သီးသန့် ထပ်ရေးထားတယ်၊ ကွဲသွားရင် validation ကို ဖြတ်ပြီး
// storage က ပယ်တဲ့ (သို့) validation ကို မဖြတ်ဘဲ သိမ်းတဲ့ row တွေ ထွေတယ်။
const CATALOG_LIMITS = {
  NAME: 300,
  CODE: 50,
  CATEGORY: 200,
  USAGE: 2000,
  DESCRIPTION: 2000,
  IMAGE_URL: 1000,
};

module.exports = { CATALOG_LIMITS };
