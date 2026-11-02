"use client";

import { useCallback, useState } from "react";
import { Copy, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useT } from "@/lib/i18n";

// bcrypt hash ဖြစ်လို့ အဟောင်း password ကို ဘယ်သူမှ ဖော်ပြလို့မရ — ဒီ modal က
// အသစ်သတ်မှတ်တာပဲ လုပ်တယ်။ Backend က tokenVersion တက်ဝေ့လို့ user ရဲ့
// device အားလုံး 401 နဲ့ ထွက်သွားမယ်။
const PASSWORD_MIN = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomPassword(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(
    "",
  );
}

interface PasswordResetModalProps {
  userName: string;
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}

export default function PasswordResetModal({
  userName,
  onSubmit,
  onClose,
}: PasswordResetModalProps) {
  const t = useT();
  const [password, setPassword] = useState(() => randomPassword());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);

  const submit = useCallback(async () => {
    if (password.trim().length < PASSWORD_MIN) {
      setError(t("admin.users.passwordTooShort"));
      return;
    }

    setError("");
    setSaving(true);

    try {
      await onSubmit(password.trim());
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }, [onSubmit, password, t]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      // Clipboard permission မရရင် admin က စာသားကို ကိုယ်တိုင် ရွေးယူလို့ရနေမယ်။
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800">
            {t("admin.users.resetTitle", { name: userName })}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          {t(applied ? "admin.users.resetDone" : "admin.users.resetWarning")}
        </p>

        <div className="flex items-stretch gap-2">
          <input
            data-testid="reset-password"
            value={password}
            readOnly={applied}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-700 outline-none focus:border-[#ff6600] disabled:bg-slate-50"
          />
          {!applied && (
            <button
              onClick={() => setPassword(randomPassword())}
              title={t("admin.users.generate")}
              className="shrink-0 rounded-lg border border-slate-200 px-3 text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={15} />
            </button>
          )}
          {applied && (
            <button
              onClick={copy}
              title={t("admin.users.copy")}
              className="shrink-0 rounded-lg border border-slate-200 px-3 text-slate-600 transition hover:bg-slate-50"
            >
              <Copy size={15} />
            </button>
          )}
        </div>

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
            {applied ? t("admin.close") : t("admin.cancel")}
          </button>
          {!applied && (
            <button
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {t("admin.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
