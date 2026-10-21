"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Plus } from "lucide-react";
import { api, ApiAdminUser } from "../../../lib/api";
import { money } from "../../../lib/money";
import { useT } from "../../../lib/i18n";
import WalletEditor from "../components/WalletEditor";

export default function AdminOwnersPage() {
  const t = useT();
  const [owners, setOwners] = useState<ApiAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [walletEdit, setWalletEdit] = useState<{
    id: string;
    address: string;
    qrUrl: string;
  } | null>(null);
  const [savingWalletId, setSavingWalletId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");

    api
      .adminListOwners()
      .then((res) => setOwners(res.owners ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    setError("");
    setNotice("");

    try {
      await api.adminCreateOwner(form);
      setForm({ name: "", phone: "", password: "" });
      setIsOpen(false);
      setNotice(t("admin.ownerCreated"));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const openWallet = (owner: ApiAdminUser) => {
    setWalletEdit({
      id: owner._id,
      address: owner.cryptoAddress ?? "",
      qrUrl: owner.cryptoQrUrl ?? "",
    });
  };

  const saveWallet = async () => {
    if (!walletEdit) return;

    setError("");
    setNotice("");
    setSavingWalletId(walletEdit.id);

    try {
      await api.adminUpdateUser(walletEdit.id, {
        cryptoAddress: walletEdit.address.trim(),
        cryptoQrUrl: walletEdit.qrUrl || null,
      });
      setWalletEdit(null);
      setNotice(t("admin.wallet.saved"));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingWalletId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-[#ff6600] px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
        >
          <Plus size={16} />
          {t("admin.create")}
        </button>
      </div>

      {isOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-500">
              {t("admin.field.name")}
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-[#ff6600]"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              {t("admin.field.phone")}
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-[#ff6600]"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              {t("admin.login.password")}
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-[#ff6600]"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={create}
              disabled={!form.name || !form.phone || !form.password}
              className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {t("admin.save")}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {t("admin.cancel")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
          {notice}
        </p>
      )}

      {/* Owner wallet editor */}
      {walletEdit && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <WalletEditor
            address={walletEdit.address}
            qrUrl={walletEdit.qrUrl}
            saving={savingWalletId === walletEdit.id}
            saveLabel={t("admin.owners.saveWallet")}
            onChange={(patch) =>
              setWalletEdit((prev) =>
                prev
                  ? {
                      ...prev,
                      ...(patch.address !== undefined
                        ? { address: patch.address }
                        : {}),
                      ...(patch.qrUrl !== undefined ? { qrUrl: patch.qrUrl } : {}),
                    }
                  : prev,
              )
            }
            onSave={saveWallet}
          />

          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setWalletEdit(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {t("admin.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.name")}</th>
              <th className="px-4 py-3">{t("admin.field.phone")}</th>
              <th className="px-4 py-3">{t("admin.field.inviteCode")}</th>
              <th className="px-4 py-3">{t("admin.owners.wallet")}</th>
              <th className="px-4 py-3">{t("admin.field.amount")}</th>
              <th className="px-4 py-3">Actions</th>
              
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : owners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.empty")}
                </td>
              </tr>
            ) : (
              owners.map((owner) => (
                <tr key={owner._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Crown size={14} className="text-amber-500" />
                      {owner.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{owner.phone}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {owner.invitationCode}
                  </td>
                  <td className="px-4 py-3">
                    {owner.cryptoAddress ? (
                      <span
                        className="block max-w-[180px] truncate font-mono text-xs text-slate-600"
                        title={owner.cryptoAddress}
                      >
                        {owner.cryptoAddress}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {t("admin.wallet.notSet")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">${money(owner.balance)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openWallet(owner)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {t("admin.owners.wallet")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
