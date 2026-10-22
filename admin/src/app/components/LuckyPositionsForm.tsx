"use client";

import { Plus, Trash2 } from "lucide-react";
import { ApiProduct } from "../../lib/api";
import { money } from "../../lib/money";
import { useT } from "../../lib/i18n";

export interface LuckyRow {
  orderNumber: string;
  productId: string;
  requiredDeposit: string;
  luckyCommission: string;
}

const EMPTY_LUCKY: LuckyRow = {
  orderNumber: "",
  productId: "",
  requiredDeposit: "0.00",
  luckyCommission: "0.00",
};

interface LuckyPositionsFormProps {
  rows: LuckyRow[];
  totalOrders: number;
  onChange: (rows: LuckyRow[]) => void;
  // Catalog နဲ့ user ရဲ့ accepted deposit (cents) — band တွက်ဖို့
  products?: ApiProduct[];
  depositCents?: number | null;
}

function toCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

// Backend ရဲ့ projectedBaseCents/priceRangeForBase နဲ့ တူညီ —
// base = deposit + ရှိပြီးသား lucky row တွေရဲ့ requiredDeposit စုစုပေါင်း
// band  = [base × ၈၀%, base × ၁၀%]
function bandForRow(
  index: number,
  rows: LuckyRow[],
  depositCents: number | null,
): { lo: number; hi: number } | null {
  if (!depositCents) return null;

  const current = Number(rows[index].orderNumber);
  let base = depositCents;

  for (let i = 0; i < index; i += 1) {
    const row = rows[i];
    const position = Number(row.orderNumber);

    if (position > 0 && position < current) {
      base += toCents(row.requiredDeposit);
    }
  }

  return { lo: Math.floor((base * 80) / 100), hi: base };
}

const usd = (cents: number) => (cents / 100).toFixed(2);

export default function LuckyPositionsForm({
  rows,
  totalOrders,
  onChange,
  products = [],
  depositCents = null,
}: LuckyPositionsFormProps) {
  const t = useT();

  const updateRow = (index: number, patch: Partial<LuckyRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-700">
            {t("admin.lucky.title")}
          </p>
          <p className="text-[11px] text-slate-500">{t("admin.lucky.hint")}</p>
        </div>
        <button
          onClick={() => onChange([...rows, { ...EMPTY_LUCKY }])}
          className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-50"
        >
          <Plus size={13} />
          {t("admin.lucky.add")}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400">{t("admin.lucky.none")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const band = bandForRow(index, rows, depositCents);

            const inBand = products.filter((product) => {
              if (!band) return true;
              const price = toCents(money(product.price));
              return price >= band.lo && price <= band.hi;
            });

            const selected = products.find((p) => p._id === row.productId);
            const selectedCents = selected ? toCents(money(selected.price)) : 0;
            const outsideBand =
              band !== null &&
              selected !== undefined &&
              (selectedCents < band.lo || selectedCents > band.hi);

            return (
              <div
                key={index}
                data-testid="lucky-row"
                className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-[100px_1fr_120px_120px_36px] sm:items-start"
              >
                <label className="text-[11px] font-semibold text-slate-500">
                  {t("admin.lucky.orderNumber")}
                  <input
                    data-testid="lucky-order-number"
                    type="number"
                    min={1}
                    max={totalOrders}
                    value={row.orderNumber}
                    onChange={(e) =>
                      updateRow(index, { orderNumber: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700 outline-none focus:border-[#ff6600]"
                  />
                </label>

                <label className="text-[11px] font-semibold text-slate-500">
                  {t("admin.lucky.product")}
                  <select
                    data-testid="lucky-product"
                    value={row.productId}
                    onChange={(e) =>
                      updateRow(index, { productId: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-slate-700 outline-none focus:border-[#ff6600]"
                  >
                    <option value="">—</option>
                    {inBand.map((product) => (
                      <option key={product._id} value={product._id}>
                        {product.code ? `${product.code} — ` : ""}
                        {product.name} (${money(product.price)})
                      </option>
                    ))}
                  </select>

                  <span className="mt-1 block text-[10px] font-normal text-slate-400">
                    {band
                      ? `${inBand.length} ${t("admin.lucky.productsInRange")} ($${usd(band.lo)}–$${usd(band.hi)})`
                      : t("admin.lucky.acceptDepositFirst")}
                  </span>

                  {outsideBand && band && (
                    <span className="mt-1 block text-[10px] font-semibold text-amber-600">
                      {t("admin.lucky.outsideRange", {
                        price: `$${usd(selectedCents)}`,
                        range: `$${usd(band.lo)}–$${usd(band.hi)}`,
                      })}
                    </span>
                  )}
                </label>

                <label className="text-[11px] font-semibold text-slate-500">
                  {t("admin.lucky.requiredDeposit")}
                  <input
                    data-testid="lucky-deposit"
                    type="text"
                    inputMode="decimal"
                    value={row.requiredDeposit}
                    onChange={(e) =>
                      updateRow(index, { requiredDeposit: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700 outline-none focus:border-[#ff6600]"
                  />
                </label>

                <label className="text-[11px] font-semibold text-slate-500">
                  {t("admin.lucky.commission")}
                  <input
                    data-testid="lucky-commission"
                    type="text"
                    inputMode="decimal"
                    value={row.luckyCommission}
                    onChange={(e) =>
                      updateRow(index, { luckyCommission: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal text-slate-700 outline-none focus:border-[#ff6600]"
                  />
                </label>

                <button
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="mt-5 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                  title={t("admin.lucky.remove")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
