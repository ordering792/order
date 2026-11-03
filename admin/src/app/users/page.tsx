"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiAdminUser, ApiUserCounts } from "@/lib/api";
import { money } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import PasswordResetModal from "../components/PasswordResetModal";
import BalanceAdjustModal, {
  type BalanceAdjustBody,
} from "../components/BalanceAdjustModal";
import WalletAddressModal from "../components/WalletAddressModal";

const PLACEHOLDER = "—";

const TILE_CAPTION =
  "text-[10px] font-semibold uppercase tracking-wide text-slate-500";

// Tile တစ်ခု နှိပ်ရင် status filter ကို ပြောင်းတယ် (active tile ပြန်နှိပ်ရင် ရှင်း)။
// `all` က status မလိုက်ဘူး — count aggregate က scope (search+role) ကိုပဲ သုံးတယ်။
const COUNT_TILES = [
  { status: "", countsKey: "all", labelKey: "admin.stats.users", tone: "text-slate-800" },
  { status: "online", countsKey: "online", labelKey: "admin.status.online", tone: "text-emerald-600" },
  { status: "offline", countsKey: "offline", labelKey: "admin.status.offline", tone: "text-slate-400" },
  { status: "burned", countsKey: "burned", labelKey: "admin.status.burned", tone: "text-red-600" },
] as const;

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

function shorten(value?: string | null, head = 8, tail = 4) {
  if (!value) return PLACEHOLDER;
  if (value.length <= head + tail + 1) return value;

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export default function AdminUsersPage() {
  const t = useT();
  const { user } = useAuth();
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState<ApiUserCounts>({
    all: 0,
    online: 0,
    offline: 0,
    burned: 0,
  });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetTarget, setResetTarget] = useState<ApiAdminUser | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{
    user: ApiAdminUser;
    type: "credit" | "debit";
  } | null>(null);
  const [walletTarget, setWalletTarget] = useState<ApiAdminUser | null>(null);
  const [noteEdit, setNoteEdit] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  // Enter နဲ့ blur နှစ်ခုလုံးက save ကိုခေါ်လို့ တစ်ခါပဲ PATCH သွားအောင် guard။
  const savingNoteRef = useRef<string | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(() => {
    setLoading(true);
    setError("");

    api
      .adminListUsers({
        search: search.trim() || undefined,
        role: role || undefined,
        status: status || undefined,
        page,
        limit: 25,
      })
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
        setPages(res.pages);
        setCounts(res.counts);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, role, status, page]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

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

  const update = (
    id: string,
    body: { role?: ApiAdminUser["role"]; status?: ApiAdminUser["status"] },
  ) => run(() => api.adminUpdateUser(id, body), t("admin.saved"));

  // Note က admin သီးသန့် (backend က owner list မှာ field ကို ဖယ်ထားတယ်)။
  // run() ကို မသုံးဘူး — ချွန့်ထွက်ရင် ရိုက်ထားတဲ့ စာသားကို cell ထဲ ပြန်ထားချင်လို့။
  const saveNote = async (id: string, raw: string) => {
    if (savingNoteRef.current === id) return;

    const value = raw.trim();
    const current =
      users.find((u) => u._id === id)?.adminNote?.trim() ?? "";

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

  const resetPassword = (target: ApiAdminUser, password: string) =>
    run(
      () => api.adminResetUserPassword(target._id, password),
      t("admin.users.passwordReset", { name: target.name }),
    );

  const adjustBalance = (
    target: ApiAdminUser,
    body: BalanceAdjustBody,
  ) =>
    run(
      async () => {
        await api.adminAdjustBalance(target._id, body);
        setAdjustTarget(null);
      },
      t("admin.users.balanceAdjusted", { name: target.name }),
    );

  // run() နဲ့မသုံးဘူး — error ကို modal အတွင်းမှာ ပြချင်လို့ (pending withdrawal
  // 409 လို server message ကို address box အောက်မှာ တိုက်ရိုက် ပြတယ်)။
  // Target က owner ဆို admin သူ့ login password လိုတယ် (role=user မလို)။
  const changeWallet = async (
    target: ApiAdminUser,
    walletAddress: string,
    password: string,
  ) => {
    await api.adminUpdateUserWalletAddress(
      target._id,
      walletAddress,
      target.role === "user" ? undefined : password,
    );

    setWalletTarget(null);
    setError("");
    setNotice(t("admin.users.walletUpdated", { name: target.name }));
    load();
  };

  const roleLabel = (value: ApiAdminUser["role"]) =>
    value === "admin"
      ? t("admin.role.admin")
      : value === "owner"
        ? t("admin.role.owner")
        : t("admin.role.user");

  // Online/Offline က backend က lastSeenAt ကနေ တွက်ပေးတဲ့ `online` ဖြစ်တယ်။
  // `status` field ကို Burn/Un-burn အလံအဖြစ်ပဲ သုံးတော့မယ်။
  const statusLabel = (user: ApiAdminUser) =>
    user.status === "burned"
      ? t("admin.status.burned")
      : user.online
        ? t("admin.status.online")
        : t("admin.status.offline");

  const statusTitle = (user: ApiAdminUser) =>
    user.status === "burned" || !user.lastSeenAt
      ? undefined
      : t("admin.status.lastSeen", { time: dateTime(user.lastSeenAt) });

  const columnCount = isAdmin ? 12 : 9;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.search")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
        >
          <option value="">{t("admin.field.role")}: —</option>
          <option value="user">{t("admin.role.user")}</option>
          <option value="owner">{t("admin.role.owner")}</option>
          <option value="admin">{t("admin.role.admin")}</option>
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
        >
          <option value="">{t("admin.field.status")}: —</option>
          <option value="online">{t("admin.status.online")}</option>
          <option value="offline">{t("admin.status.offline")}</option>
          <option value="burned">{t("admin.status.burned")}</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {COUNT_TILES.map((tile) => {
          const active = status === tile.status;

          return (
            <button
              key={tile.countsKey}
              type="button"
              data-testid={`count-tile-${tile.countsKey}`}
              aria-pressed={active}
              onClick={() => {
                // Active tile ပြန်နှိပ်ရင် filter ရှင်း (Total tile က အမြဲ empty status)။
                setStatus(active && tile.status ? "" : tile.status);
                setPage(1);
              }}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-[#ff6600] bg-orange-50/70"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className={TILE_CAPTION}>{t(tile.labelKey)}</span>
              <span className={`text-lg font-bold ${tile.tone}`}>
                {counts[tile.countsKey]}
              </span>
            </button>
          );
        })}
      </div>

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1450px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.name")}</th>
              <th className="px-4 py-3">{t("admin.field.phone")}</th>
              <th className="px-4 py-3">{t("admin.field.inviteCode")}</th>
              <th className="px-4 py-3">{t("admin.field.balance")}</th>
              <th className="px-4 py-3">{t("admin.field.wallet")}</th>
              {isAdmin && <th className="px-4 py-3">{t("admin.field.password")}</th>}
              <th className="px-4 py-3">{t("admin.field.ipDevice")}</th>
              <th className="px-4 py-3">{t("admin.field.status")}</th>
              <th className="px-4 py-3">{t("admin.field.role")}</th>
              <th className="px-4 py-3">{t("admin.field.lastLogin")}</th>
              {isAdmin && <th className="px-4 py-3">{t("admin.field.note")}</th>}
              {isAdmin && <th className="px-4 py-3">{t("admin.field.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.empty")}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {u.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.phone}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {u.invitationCode}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-700">${money(u.balance)}</span>
                      {isAdmin && u.role !== "admin" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => setAdjustTarget({ user: u, type: "credit" })}
                            title={t("admin.users.increase")}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[11px] font-bold text-emerald-600 transition hover:bg-emerald-100"
                          >
                            +
                          </button>
                          <button
                            onClick={() => setAdjustTarget({ user: u, type: "debit" })}
                            title={t("admin.users.decrease")}
                            className="rounded-md border border-red-200 bg-red-50 px-1.5 text-[11px] font-bold text-red-600 transition hover:bg-red-100"
                          >
                            −
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-mono text-xs text-slate-600"
                        title={u.walletAddress ?? undefined}
                      >
                        {shorten(u.walletAddress)}
                      </span>
                      {isAdmin && u.role !== "admin" && (
                        <button
                          onClick={() => setWalletTarget(u)}
                          className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          {t("admin.users.change")}
                        </button>
                      )}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {u.role === "admin" ? (
                        <span className="text-xs text-slate-400">{PLACEHOLDER}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tracking-widest text-slate-400">
                            ••••••
                          </span>
                          <button
                            onClick={() => setResetTarget(u)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            {t("admin.users.reset")}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <span className="block font-mono">{u.ipAddress ?? PLACEHOLDER}</span>
                    <span className="block text-slate-400">
                      {u.lastDevice ?? PLACEHOLDER}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={statusTitle(u)}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        u.status === "burned"
                          ? "bg-red-50 text-red-600"
                          : u.online
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {statusLabel(u)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-xs text-slate-500"
                    title={fullDateTime(u.lastLoginAt)}
                  >
                    {dateTime(u.lastLoginAt)}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 align-middle">
                      {noteEdit?.id === u._id ? (
                        <input
                          data-testid="note-input"
                          autoFocus
                          value={noteEdit.value}
                          maxLength={500}
                          disabled={savingNoteId === u._id}
                          placeholder={t("admin.users.notePlaceholder")}
                          onChange={(e) =>
                            setNoteEdit({ id: u._id, value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            } else if (e.key === "Escape") {
                              setNoteEdit(null);
                            }
                          }}
                          onBlur={(e) => void saveNote(u._id, e.target.value)}
                          className="w-[190px] rounded-md border border-[#ff6600] bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            setNoteEdit({ id: u._id, value: u.adminNote ?? "" })
                          }
                          title={u.adminNote ?? undefined}
                          className={`w-[190px] truncate rounded-md border px-2 py-1 text-left text-xs transition ${
                            u.adminNote
                              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                              : "border-dashed border-slate-200 text-slate-400 hover:bg-slate-50"
                          }`}
                        >
                          {u.adminNote || t("admin.users.notePlaceholder")}
                        </button>
                      )}
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.role !== "owner" && (
                          <button
                            onClick={() => update(u._id, { role: "owner" })}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            {t("admin.users.toOwner")}
                          </button>
                        )}
                        {u.role !== "user" && (
                          <button
                            onClick={() => update(u._id, { role: "user" })}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            {t("admin.users.toUser")}
                          </button>
                        )}
                        {u.status === "burned" ? (
                          <button
                            onClick={() => update(u._id, { status: "offline" })}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100"
                          >
                            {t("admin.action.accept")}
                          </button>
                        ) : (
                          <button
                            onClick={() => update(u._id, { status: "burned" })}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
                          >
                            {t("admin.status.burned")}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {page} / {pages} ({total})
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.back")}
            </button>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.next")}
            </button>
          </div>
        </div>
      )}

      {resetTarget && (
        <PasswordResetModal
          userName={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onSubmit={(password) => resetPassword(resetTarget, password)}
        />
      )}

      {adjustTarget && (
        <BalanceAdjustModal
          userName={adjustTarget.user.name}
          currentBalance={money(adjustTarget.user.balance)}
          initialType={adjustTarget.type}
          onClose={() => setAdjustTarget(null)}
          onSubmit={(body) => adjustBalance(adjustTarget.user, body)}
        />
      )}

      {walletTarget && (
        <WalletAddressModal
          userName={walletTarget.name}
          currentAddress={walletTarget.walletAddress ?? null}
          requiresPassword={walletTarget.role !== "user"}
          onClose={() => setWalletTarget(null)}
          onSubmit={(walletAddress, password) =>
            changeWallet(walletTarget, walletAddress, password)
          }
        />
      )}
    </div>
  );
}
