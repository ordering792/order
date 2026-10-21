"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import WalletEditor from "../components/WalletEditor";

export default function AdminWalletPage() {
  const t = useT();
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    api
      .adminListUsers({ search: user.phone, limit: 5 })
      .then((res) => {
        const me = res.users.find((u) => u._id === user.id);
        setAddress(me?.cryptoAddress ?? "");
        setQrUrl(me?.cryptoQrUrl ?? "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  const save = async () => {
    setError("");
    setNotice("");
    setSaving(true);

    try {
      await api.updateOwnerCryptoAddress(address.trim(), qrUrl || null);
      setNotice(t("admin.wallet.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Wallet size={18} className="text-[#ff6600]" />
        <h2 className="text-sm font-bold text-slate-800">
          {t("admin.wallet.title")}
        </h2>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        {t("admin.wallet.description")}
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">{t("admin.loading")}</p>
      ) : (
        <WalletEditor
          address={address}
          qrUrl={qrUrl}
          saving={saving}
          onChange={(patch) => {
            if (patch.address !== undefined) setAddress(patch.address);
            if (patch.qrUrl !== undefined) setQrUrl(patch.qrUrl);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}
