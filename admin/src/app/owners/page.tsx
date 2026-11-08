"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Plus } from "lucide-react";
import { api, ApiAdminUser } from "@/lib/api";
import { money } from "@/lib/money";
import { useT } from "@/lib/i18n";
import PasswordResetModal from "../components/PasswordResetModal";
import WalletEditor from "../components/WalletEditor";

const PLACEHOLDER = "—";

// ဇယား ကော်လံရေ ၁၁ ခု (name, phone, invite, wallet, amount, password, IP/device,
// status, last login, note, actions) — loading/empty row ရဲ့ colSpan အတွက်။
const COLUMN_COUNT = 11;

function dateTime(value?: string | null) {
  if (!value) return PLACEHOLDER;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER;

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function fullDateTime(value?: string | null) {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

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
    password: string;
  } | null>(null);
  const [savingWalletId, setSavingWalletId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ApiAdminUser | null>(null);
  const [noteEdit, setNoteEdit] = useState<{ id: string; value: string } | null>(
    null,
  );
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  // Enter နဲ့ blur နှစ်ခုလုံးက save ကိုခေါ်လို့ တစ်ခါပဲ PATCH သွားအောင် guard။
  const savingNoteRef = useRef<string | null>(null);

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

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setError("");
    setNotice("");

    try {
      await action();
      setNotice(successMessage);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  // Role လျှော့ခြင်းနဲ့ Burn အလံ — ဒီဇယားမှာ နှစ်ခုလုံး PATCH /admin/users/:id ကပဲ
  // (admin သာ)။ Owner row တွေ Users page ထဲက ပျောက်ပြီးလို့ ဒီဇယားက တစ်ခုတည်းနေရာ။
  // Owner ဆီ burn ပွင့်တာက user row တွေအတွက်ပဲ — Users page လမ်းခွဲ ခလုတ်။
  const update = (
    id: string,
    body: { role?: ApiAdminUser["role"]; status?: ApiAdminUser["status"] },
  ) => run(() => api.adminUpdateUser(id, body), t("admin.saved"));

  // Owner password reset ကို backend က ကြိုခွင့်ပြ်ပြီး (`adminOrOwner`, target
  // role=admin ဆိုပဲ 403) — tokenVersion တက်လို့ owner panel session ထွက်သွားမယ်။
  const resetPassword = (target: ApiAdminUser, password: string) =>
    run(
      () => api.adminResetUserPassword(target._id, password),
      t("admin.users.passwordReset", { name: target.name }),
    );

  // run() ကို မသုံးဘူး — ချွန့်ထွက်ရင် ရိုက်ထားတဲ့ စာသားကို cell ထဲ ပြန်ထားချင်လို့။
  const saveNote = async (id: string, raw: string) => {
    if (savingNoteRef.current === id) return;

    const value = raw.trim();
    const current = owners.find((o) => o._id === id)?.adminNote?.trim() ?? "";

    if (value === current) {
      setNoteEdit(null);
      return;
    }

    savingNoteRef.current = id;
    setSavingNoteId(id);

    try {
      await api.adminUpdateUser(id, { adminNote: value || null });
      setError("");
      setNotice(t("admin.saved"));
      setNoteEdit(null);
      load();
    } catch (err) {
      setNoteEdit({ id, value });
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      savingNoteRef.current = null;
      setSavingNoteId(null);
    }
  };

  // Online/Offline က backend က lastSeenAt ကနေ တွက်ပေးတဲ့ `online` ဖြစ်တယ်။
  // `status` field ကို Burn/Un-burn အလံအဖြစ်ပဲ သုံးတော့မယ်။
  const statusLabel = (owner: ApiAdminUser) =>
    owner.status === "burned"
      ? t("admin.status.burned")
      : owner.online
        ? t("admin.status.online")
        : t("admin.status.offline");

  const statusTitle = (owner: ApiAdminUser) =>
    owner.status === "burned" || !owner.lastSeenAt
      ? undefined
      : t("admin.status.lastSeen", { time: dateTime(owner.lastSeenAt) });

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
      password: "",
    });
  };

  const saveWallet = async () => {
    if (!walletEdit) return;

    setError("");
    setNotice("");
    setSavingWalletId(walletEdit.id);

    try {
      // Owner ဆီသွားငွေ လိပ်စာ ဖြစ်လို့ နှိပ်နေတဲ့ admin သူ့ login password ကို
      // backend က စစ်တယ် — မှားရင် 400 ပြီး owner ရဲ့ လိပ်စာ မထိဘူး။
      await api.adminUpdateUser(walletEdit.id, {
        cryptoAddress: walletEdit.address.trim(),
        cryptoQrUrl: walletEdit.qrUrl || null,
        password: walletEdit.password,
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
            password={walletEdit.password}
            saving={savingWalletId === walletEdit.id}
            saveLabel={t("admin.owners.saveWallet")}
            onPasswordChange={(value) =>
              setWalletEdit((prev) =>
                prev ? { ...prev, password: value } : prev,
              )
            }
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
        <table className="w-full min-w-[1250px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.name")}</th>
              <th className="px-4 py-3">{t("admin.field.phone")}</th>
              <th className="px-4 py-3">{t("admin.field.inviteCode")}</th>
              <th className="px-4 py-3">{t("admin.owners.wallet")}</th>
              <th className="px-4 py-3">{t("admin.field.amount")}</th>
              <th className="px-4 py-3">{t("admin.field.password")}</th>
              <th className="px-4 py-3">{t("admin.field.ipDevice")}</th>
              <th className="px-4 py-3">{t("admin.field.status")}</th>
              <th className="px-4 py-3">{t("admin.field.lastLogin")}</th>
              <th className="px-4 py-3">{t("admin.field.note")}</th>
              <th className="px-4 py-3">{t("admin.field.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  {t("admin.loading")}
                </td>
              </tr>
            ) : owners.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="px-4 py-6 text-center text-slate-400"
                >
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
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs tracking-widest text-slate-400">
                        ••••••
                      </span>
                      <button
                        onClick={() => setResetTarget(owner)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        {t("admin.users.reset")}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <span className="block font-mono">
                      {owner.ipAddress ?? PLACEHOLDER}
                    </span>
                    <span className="block text-slate-400">
                      {owner.lastDevice ?? PLACEHOLDER}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={statusTitle(owner)}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        owner.status === "burned"
                          ? "bg-red-50 text-red-600"
                          : owner.online
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {statusLabel(owner)}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-xs text-slate-500"
                    title={fullDateTime(owner.lastLoginAt)}
                  >
                    {dateTime(owner.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {noteEdit?.id === owner._id ? (
                      <input
                        data-testid="owner-note-input"
                        autoFocus
                        value={noteEdit.value}
                        maxLength={500}
                        disabled={savingNoteId === owner._id}
                        placeholder={t("admin.users.notePlaceholder")}
                        onChange={(e) =>
                          setNoteEdit({ id: owner._id, value: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            setNoteEdit(null);
                          }
                        }}
                        onBlur={(e) => void saveNote(owner._id, e.target.value)}
                        className="w-[190px] rounded-md border border-[#ff6600] bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                      />
                    ) : (
                      <button
                        onClick={() =>
                          setNoteEdit({
                            id: owner._id,
                            value: owner.adminNote ?? "",
                          })
                        }
                        title={owner.adminNote ?? undefined}
                        className={`w-[190px] truncate rounded-md border px-2 py-1 text-left text-xs transition ${
                          owner.adminNote
                            ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border-dashed border-slate-200 text-slate-400 hover:bg-slate-50"
                        }`}
                      >
                        {owner.adminNote || t("admin.users.notePlaceholder")}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openWallet(owner)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        {t("admin.owners.wallet")}
                      </button>
                      <button
                        onClick={() => update(owner._id, { role: "user" })}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        {t("admin.users.toUser")}
                      </button>
                      {owner.status === "burned" ? (
                        <button
                          onClick={() => update(owner._id, { status: "offline" })}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100"
                        >
                          {t("admin.action.accept")}
                        </button>
                      ) : (
                        <button
                          onClick={() => update(owner._id, { status: "burned" })}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          {t("admin.status.burned")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {resetTarget && (
        <PasswordResetModal
          userName={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onSubmit={(password) => resetPassword(resetTarget, password)}
        />
      )}
    </div>
  );
}
