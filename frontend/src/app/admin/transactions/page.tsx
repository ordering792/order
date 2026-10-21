"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiTransaction } from "../../../lib/api";
import { money } from "../../../lib/money";
import { useT } from "../../../lib/i18n";

export default function AdminTransactionsPage() {
  const t = useT();
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState<ApiTransaction | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");

    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (type) query.set("type", type);

    api
      .get<{ transactions: ApiTransaction[] }>(
        `/transactions/admin${query.toString() ? `?${query}` : ""}`,
      )
      .then((res) => setTransactions(res.transactions))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, type]);

  useEffect(load, [load]);

  const accept = async (tx: ApiTransaction) => {
    setError("");
    try {
      await api.acceptTransaction(tx._id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setError("");
    try {
      await api.rejectTransaction(rejecting._id, reason);
      setRejecting(null);
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const statusLabel = (value: string) =>
    value === "accepted"
      ? t("admin.status.accepted")
      : value === "rejected"
        ? t("admin.status.rejected")
        : t("admin.status.pending");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
        >
          <option value="">{t("admin.field.status")}: —</option>
          <option value="pending">{t("admin.status.pending")}</option>
          <option value="accepted">{t("admin.status.accepted")}</option>
          <option value="rejected">{t("admin.status.rejected")}</option>
        </select>

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
        >
          <option value="">{t("admin.field.type")}: —</option>
          <option value="deposit">Deposit</option>
          <option value="withdraw">Withdraw</option>
        </select>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {rejecting && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-800">
            {t("admin.action.reject")} — {money(rejecting.amount)}
          </h3>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={reject}
              className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600"
            >
              {t("admin.action.reject")}
            </button>
            <button
              onClick={() => setRejecting(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {t("admin.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.name")}</th>
              <th className="px-4 py-3">{t("admin.field.type")}</th>
              <th className="px-4 py-3">{t("admin.field.amount")}</th>
              <th className="px-4 py-3">{t("admin.field.status")}</th>
              <th className="px-4 py-3">{t("admin.field.image")}</th>
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
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.empty")}
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                const user =
                  typeof tx.userId === "string" ? null : tx.userId;

                return (
                  <tr key={tx._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">
                        {user?.name ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500">{user?.phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tx.type}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      ${money(tx.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          tx.status === "accepted"
                            ? "bg-emerald-50 text-emerald-600"
                            : tx.status === "rejected"
                              ? "bg-red-50 text-red-600"
                              : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {statusLabel(tx.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.proofScreenshot ? (
                        <a
                          href={tx.proofScreenshot}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-10 w-10 overflow-hidden rounded-lg border border-slate-200"
                        >
                          <img
                            src={tx.proofScreenshot}
                            alt="proof"
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tx.status === "pending" && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => accept(tx)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100"
                          >
                            {t("admin.action.accept")}
                          </button>
                          <button
                            onClick={() => setRejecting(tx)}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
                          >
                            {t("admin.action.reject")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
