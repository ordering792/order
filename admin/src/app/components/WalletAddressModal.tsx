"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

// TRON (TRC20) address — 'T' နဲ့စပြီး base58 ၃၃ လုံး (0 O I l မပါ)။
// Backend က ဒီအတိုင်းစစ်တယ် — ဒီ check က round-trip မလိုအပ်အောင် ပိတ်တာပဲ။
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

interface WalletAddressModalProps {
  userName: string;
  currentAddress: string | null;
  onSubmit: (walletAddress: string) => Promise<void>;
  onClose: () => void;
}

export default function WalletAddressModal({
  userName,
  currentAddress,
  onSubmit,
  onClose,
}: WalletAddressModalProps) {
  const t = useT();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const value = address.trim();
  const canSubmit = !saving && TRON_ADDRESS.test(value);

  const submit = async () => {
    if (!TRON_ADDRESS.test(value)) {
      setError(t("admin.users.walletInvalid"));
      return;
    }

    if (value === currentAddress) {
      setError(t("admin.users.walletUnchanged"));
      return;
    }

    setError("");
    setSaving(true);

    try {
      await onSubmit(value);
    } catch (err) {
      // Pending withdrawal 409 လို server က ပြန်တဲ့ message ကို ဒီမှာပဲ ပြတယ်။
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">
            {t("admin.users.walletTitle", { name: userName })}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>{t("admin.users.walletCurrent")}</span>
          <span className="break-all font-mono text-[11px] text-slate-500">
            {currentAddress ?? t("admin.wallet.notSet")}
          </span>
        </p>

        <label className="block text-xs font-semibold text-slate-500">
          {t("admin.field.wallet")}
          <input
            data-testid="wallet-address-input"
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            maxLength={100}
            spellCheck={false}
            placeholder="TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700 outline-none focus:border-[#ff6600]"
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-400">
            {t("admin.users.walletHint")}
          </span>
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
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
