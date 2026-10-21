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
