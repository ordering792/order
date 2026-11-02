// TRON (TRC20) address: 'T' နဲ့ စပြီး base58 စာလုံး ၃၃ လုံး — စုစုပေါင်း ၃၄။
// base58 မှာ 0 O I l မပါလို့ format မှားထည့်မိတာကို မသိမ်းခင် ပိတ်နိုင်တယ်။
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

const INVALID_WALLET_ADDRESS_MESSAGE =
  "Enter a valid TRC20 wallet address (T followed by 33 letters or digits)";

function normalizeWalletAddress(value) {
  return String(value ?? "").trim();
}

function isTronAddress(value) {
  return TRON_ADDRESS.test(normalizeWalletAddress(value));
}

module.exports = {
  TRON_ADDRESS,
  INVALID_WALLET_ADDRESS_MESSAGE,
  normalizeWalletAddress,
  isTronAddress,
};
