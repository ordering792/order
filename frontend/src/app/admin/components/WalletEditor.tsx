"use client";

import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useT } from "../../../lib/i18n";

interface WalletEditorProps {
  address: string;
  qrUrl: string;
  onChange: (patch: { address?: string; qrUrl?: string }) => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  testId?: string;
}

// Admin / Owner ရဲ့ payout address + QR code သတ်မှတ်တဲ့ form ကို
// /admin/wallet နဲ့ /admin/owners နှစ်ခုလုံးမှာ ပြန်သုံးနေသော shared component။
export default function WalletEditor({
  address,
  qrUrl,
  onChange,
  onSave,
  saving = false,
  saveLabel,
  testId = "wallet-editor",
}: WalletEditorProps) {
  const t = useT();
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      onChange({ qrUrl: String(event.target?.result ?? "") });
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      data-testid={testId}
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-500">
          {t("admin.wallet.address")}
          <input
            data-testid="wallet-address"
            type="text"
            value={address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="block text-xs font-semibold text-slate-500">
          {t("admin.wallet.qr")}
          <input
            data-testid="wallet-qr-url"
            type="text"
            value={qrUrl.startsWith("data:") ? "" : qrUrl}
            onChange={(e) => onChange({ qrUrl: e.target.value })}
            placeholder="https://.../qr.png"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-400">
            {t("admin.wallet.qrHint")}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
            <Camera size={14} />
            {isUploading ? t("admin.loading") : t("admin.wallet.uploadQr")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
          </label>

          {qrUrl && (
            <button
              onClick={() => onChange({ qrUrl: "" })}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
            >
              <Trash2 size={14} />
              {t("admin.wallet.clearQr")}
            </button>
          )}

          <button
            onClick={onSave}
            disabled={saving || address.trim().length < 10}
            className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {saveLabel ?? t("admin.wallet.save")}
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt="QR"
            className="h-48 w-48 rounded-lg border border-slate-200 bg-white object-contain"
          />
        ) : address.trim().length >= 10 ? (
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address.trim()}`}
            alt="QR"
            className="h-48 w-48 rounded-lg border border-slate-200 bg-white object-contain"
          />
        ) : (
          <p className="py-10 text-xs text-slate-400">
            {t("admin.wallet.notSet")}
          </p>
        )}

        {address && (
          <p className="max-w-full break-all text-center font-mono text-[11px] text-slate-500">
            {address}
          </p>
        )}
      </div>
    </div>
  );
}
