export type MoneyValue =
  | string
  | number
  | { $numberDecimal: string }
  | null
  | undefined;

// Mongoose Decimal128 က JSON မှာ { $numberDecimal: "50.00" } ပုံစံနဲ့ လာလို့
// API response ထဲက စကားပိုင်းတိုင်းကို တူတူပြောင်းပေးနိုင်ရန် helper။
export function money(value: MoneyValue): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toFixed(2);
  if (typeof value === "string") return value;
  return value.$numberDecimal ?? "—";
}

// Number() / parseFloat() ကို API value အပေါ် တိုက်ရိုက်မသုံးဘူး —
// Decimal128 ပုံစံကျရင် NaN ဖြစ်ပြီး UI မှာ "$NaN" ပြသောမယ်။
export function moneyNumber(value: MoneyValue): number {
  const parsed = Number(money(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

// စာရင်း/လက်ကျန် ပြသရန် (ထောင်ဂဏန်း comma ပါ)။
export function formatMoney(value: MoneyValue): string {
  return moneyNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
