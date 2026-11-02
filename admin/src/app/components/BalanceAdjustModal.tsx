"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

// Backend က integer cents (BigInt) နဲ့ တွက်တယ် — ဒီ preview ကလည်း အတူတူ
// string ကနေ cent အဖြစ် ပြောင်းပြီး တွက်တယ် (float မသုံးဘူး)။
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

function toCents(value: string): number | null {
  if (!AMOUNT_PATTERN.test(value)) return null;

  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function fromCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);

  return `${negative ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface BalanceAdjustBody {
  type: "credit" | "debit";
  amount: string;
  reason?: string;
}

interface BalanceAdjustModalProps {
  userName: string;
  currentBalance: string;
  initialType?: "credit" | "debit";
  onSubmit: (body: BalanceAdjustBody) => Promise<void>;
  onClose: () => void;
}

export default function BalanceAdjustModal({
  userName,
  currentBalance,
  initialType = "credit",
  onSubmit,
  onClose,
}: BalanceAdjustModalProps) {
  const t = useT();
  const [type, setType] = useState<"credit" | "debit">(initialType);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const beforeCents = toCents(currentBalance) ?? 0;
  const deltaCents = amount ? toCents(amount) : null;
  const afterCents =
    deltaCents === null
      ? null
      : type === "credit"
        ? beforeCents + deltaCents
        : beforeCents - deltaCents;
  const wouldGoNegative = afterCents !== null && afterCents < 0;
  const canSubmit =
    !saving && deltaCents !== null && deltaCents > 0 && !wouldGoNegative;

  const submit = async () => {
    if (deltaCents === null || deltaCents <= 0) {
      setError(t("admin.users.invalidAmount"));
      return;
    }

    if (wouldGoNegative) {
      setError(t("admin.users.negativeBlocked"));
      return;
    }

    setError("");
    setSaving(true);

    try {
      await onSubmit({
        type,
        amount,
        reason: reason.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">
            {t("admin.users.adjustTitle", { name: userName })}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["credit", "debit"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setType(option)}
              className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                type === option
                  ? option === "credit"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-red-300 bg-red-50 text-red-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t(option === "credit" ? "admin.users.increase" : "admin.users.decrease")}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-slate-500">
          {t("admin.field.amount")}
          <input
            data-testid="adjust-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.trim())}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold text-slate-500">
          {t("admin.users.reason")}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={t("admin.users.reasonHint")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <p className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>
            {t("admin.field.balance")}: ${currentBalance}
          </span>
          <span className="font-bold text-slate-800">
            {afterCents === null
              ? `→ $${currentBalance}`
              : `→ $${fromCents(afterCents)}`}
          </span>
        </p>

        {wouldGoNegative && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
            {t("admin.users.negativeBlocked")}
          </p>
        )}
        {error && !wouldGoNegative && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            {t("admin.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {t("admin.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
