"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiAdminUser } from "../../../lib/api";
import { money } from "../../../lib/money";
import { useAuth } from "../../../lib/auth";
import { useT } from "../../../lib/i18n";

export default function AdminUsersPage() {
  const t = useT();
  const { user } = useAuth();
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, role, status, page]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const update = async (
    id: string,
    body: { role?: ApiAdminUser["role"]; status?: ApiAdminUser["status"] },
  ) => {
    setError("");
    try {
      await api.adminUpdateUser(id, body);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const roleLabel = (value: ApiAdminUser["role"]) =>
    value === "admin"
      ? t("admin.role.admin")
      : value === "owner"
        ? t("admin.role.owner")
        : t("admin.role.user");

  const statusLabel = (value: ApiAdminUser["status"]) =>
    value === "burned"
      ? t("admin.status.burned")
      : value === "online"
        ? t("admin.status.online")
        : t("admin.status.offline");

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

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.name")}</th>
              <th className="px-4 py-3">{t("admin.field.phone")}</th>
              <th className="px-4 py-3">{t("admin.field.inviteCode")}</th>
              <th className="px-4 py-3">{t("admin.field.role")}</th>
              <th className="px-4 py-3">{t("admin.field.status")}</th>
              <th className="px-4 py-3">{t("admin.field.amount")}</th>
              {isAdmin && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
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
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        u.status === "burned"
                          ? "bg-red-50 text-red-600"
                          : u.status === "online"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {statusLabel(u.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">${money(u.balance)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.role !== "owner" && (
                          <button
                            onClick={() => update(u._id, { role: "owner" })}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            → Owner
                          </button>
                        )}
                        {u.role !== "user" && (
                          <button
                            onClick={() => update(u._id, { role: "user" })}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            → User
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
              {t("admin.refresh")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
