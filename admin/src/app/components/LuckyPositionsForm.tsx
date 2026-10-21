"use client";

import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface LuckyRow {
  orderNumber: string;
  requiredDeposit: string;
  luckyCommission: string;
}

const EMPTY_LUCKY: LuckyRow = {
  orderNumber: "",
  requiredDeposit: "0.00",
  luckyCommission: "0.00",
};

interface LuckyPositionsFormProps {
  rows: LuckyRow[];
  totalOrders: number;
  onChange: (rows: LuckyRow[]) => void;
}

// Admin က lucky order သတ်မှတ်တဲ့ form —
// order position + required deposit + commission (product က backend က အလိုအလျောက် ရွေးမယ်)။
export default function LuckyPositionsForm({
  rows,
  totalOrders,
  onChange,
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
          {rows.map((row, index) => (
            <div
              key={index}
              data-testid="lucky-row"
              className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-[100px_1fr_1fr_36px] sm:items-end"
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
                className="mb-0.5 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                title={t("admin.lucky.remove")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
