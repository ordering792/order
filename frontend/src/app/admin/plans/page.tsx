"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  api,
  ApiAdminUser,
  ApiPlan,
  ApiTask,
  ApiTransaction,
} from "../../../lib/api";
import { money } from "../../../lib/money";
import { useT } from "../../../lib/i18n";
import LuckyPositionsForm, {
  type LuckyRow,
} from "../components/LuckyPositionsForm";
import TaskPanel from "../components/TaskPanel";

export default function AdminPlansPage() {
  const t = useT();
  const [plans, setPlans] = useState<
    (ApiPlan & { user?: { _id: string; name: string; phone: string } })[]
  >([]);
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [totalOrders, setTotalOrders] = useState(40);
  const [luckyRows, setLuckyRows] = useState<LuckyRow[]>([]);
  const [taskPlan, setTaskPlan] = useState<
    (ApiPlan & { user?: { _id: string; name: string; phone: string } }) | null
  >(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");

    Promise.all([
      api.adminListPlans(),
      api.adminListUsers({ limit: 200 }),
      api.adminListTransactions(),
    ])
      .then(([planRes, userRes, txRes]) => {
        setPlans(planRes.plans);
        setUsers(userRes.users);
        setTransactions(txRes.transactions);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const depositsFor = useCallback(
    (planUserId: string) => {
      const mine = transactions.filter((tx) => {
        const txUserId =
          typeof tx.userId === "string" ? tx.userId : tx.userId?._id;
        return txUserId === planUserId && tx.type === "deposit";
      });

      return {
        accepted: mine.find((tx) => tx.status === "accepted") ?? null,
        pending: mine.filter((tx) => tx.status === "pending"),
      };
    },
    [transactions],
  );

  const createPlan = async () => {
    setError("");
    setNotice("");

    const luckyPositions = luckyRows
      .filter((row) => row.orderNumber)
      .map((row) => ({
        orderNumber: Number(row.orderNumber),
        requiredDeposit: row.requiredDeposit || "0.00",
        luckyCommission: row.luckyCommission || "0.00",
      }));

    try {
      await api.adminCreatePlan({
        userId,
        totalOrders: Number(totalOrders),
        luckyPositions,
      });
      setIsCreateOpen(false);
      setUserId("");
      setLuckyRows([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const generate = async (plan: ApiPlan) => {
    setError("");
    setNotice("");

    const { accepted, pending } = depositsFor(plan.userId);

    if (!accepted) {
      setError(
        pending.length > 0
          ? t("admin.plans.acceptFirst")
          : t("admin.plans.depositMissing"),
      );
      return;
    }

    try {
      await api.adminGeneratePlan(plan._id, accepted._id);
      setNotice(`Order #${plan.totalOrders} generated`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    }
  };

  const remove = async (plan: ApiPlan) => {
    if (!window.confirm(t("admin.deleteConfirm"))) return;

    setError("");
    try {
      await api.adminDeletePlan(plan._id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const openTasks = async (plan: ApiPlan) => {
    setError("");
    setTaskPlan(plan);
    setTasks([]);

    try {
      const res = await api.adminListUserTasks(plan.userId);
      setTasks(res.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const completeTask = async (task: ApiTask) => {
    setError("");
    setBusyTaskId(task._id);

    try {
      await api.completeTask(task._id);

      // Progress ကို ချက်ချင်း update လုပ်ပြီးး ပြန်ဖတ်မယ်။
      setTaskPlan((prev) =>
        prev ? { ...prev, completedCount: prev.completedCount + 1 } : prev,
      );
      setPlans((rows) =>
        rows.map((row) =>
          row._id === taskPlan?._id
            ? { ...row, completedCount: row.completedCount + 1 }
            : row,
        ),
      );

      const res = await api.adminListUserTasks(taskPlan?.userId ?? "");
      setTasks(res.tasks);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyTaskId(null);
    }
  };

  const statusLabel = (value: string) =>
    value === "generated"
      ? t("admin.stats.generated")
      : value === "completed"
        ? t("admin.stats.completed")
        : t("admin.status.draft");

  const livePlan = taskPlan
    ? (plans.find((p) => p._id === taskPlan._id) ?? taskPlan)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsCreateOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-[#ff6600] px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
        >
          <Plus size={16} />
          {t("admin.create")}
        </button>
      </div>

      {isCreateOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              {t("admin.field.name")}
              <select
                data-testid="plan-user-select"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.phone})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500">
              {t("admin.stats.plans")}
              <input
                data-testid="plan-total-orders"
                type="number"
                min={1}
                max={500}
                value={totalOrders}
                onChange={(e) => setTotalOrders(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
              />
            </label>
          </div>

          <LuckyPositionsForm
            rows={luckyRows}
            totalOrders={totalOrders}
            onChange={setLuckyRows}
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={createPlan}
              disabled={!userId}
              className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {t("admin.save")}
            </button>
            <button
              onClick={() => setIsCreateOpen(false)}
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

      {livePlan && (
        <TaskPanel
          userName={livePlan.user?.name ?? ""}
          completedCount={livePlan.completedCount}
          totalOrders={livePlan.totalOrders}
          tasks={tasks}
          busyTaskId={busyTaskId}
          onComplete={completeTask}
          onClose={() => setTaskPlan(null)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.name")}</th>
              <th className="px-4 py-3">{t("admin.stats.plans")}</th>
              <th className="px-4 py-3">{t("admin.stats.completed")}</th>
              <th className="px-4 py-3">{t("admin.field.status")}</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.empty")}
                </td>
              </tr>
            ) : (
              plans.map((plan) => {
                const percent =
                  plan.totalOrders > 0
                    ? Math.min(
                        100,
                        Math.round((plan.completedCount / plan.totalOrders) * 100),
                      )
                    : 0;
                const deposits = depositsFor(plan.userId);

                return (
                  <tr key={plan._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">
                        {plan.user?.name ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {plan.user?.phone ?? ""}
                      </p>
                      {deposits.accepted ? (
                        <span className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                          {t("admin.plans.depositReady")} $
                          {money(deposits.accepted.amount)}
                        </span>
                      ) : deposits.pending.length > 0 ? (
                        <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                          {t("admin.plans.pendingDeposit")} $
                          {money(deposits.pending[0].amount)}
                        </span>
                      ) : (
                        <span className="mt-1 inline-block rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                          {t("admin.plans.depositMissing")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{plan.totalOrders}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">
                        {plan.completedCount} / {plan.totalOrders}
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[#ff6600]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {statusLabel(plan.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openTasks(plan)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          {t("admin.plans.tasks")}
                        </button>
                        {plan.status === "draft" && (
                          <button
                            onClick={() => generate(plan)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100"
                          >
                            {t("admin.action.generate")}
                          </button>
                        )}
                        <button
                          onClick={() => remove(plan)}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          {t("admin.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        {plans.length} {t("admin.stats.plans")} · {transactions.length} tx
      </p>
    </div>
  );
}
