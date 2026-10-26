// Master invitation code — authController နဲ့ taskCompletionService နှစ်နေရာမှာ
// ဖတ်ခဲ့တယ်၊ env ဖတ်ပုံ မတူရင် referral logic တွေ ကွဲသွားမယ်။
const DEFAULT_INVITATION_CODE =
  process.env.DEFAULT_INVITATION_CODE || "MASTER2024";

module.exports = { DEFAULT_INVITATION_CODE };
