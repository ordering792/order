"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  api,
  ApiAdminUser,
  ApiDepositSummary,
  ApiPlan,
  ApiProduct,
  ApiTask,
} from "@/lib/api";
import { money } from "@/lib/money";
import { useT } from "@/lib/i18n";
import { getSocket } from "@/lib/socket";
import LuckyPositionsForm, {
  type LuckyRow,
} from "../components/LuckyPositionsForm";
import TaskPanel from "../components/TaskPanel";

type DepositMap = Record<string, ApiDepositSummary>;

function mergeDeposits(prev: DepositMap, list: ApiDepositSummary[]): DepositMap {
  if (list.length === 0) return prev;

  const next = { ...prev };
  for (const item of list) next[item.userId] = item;
  return next;
}

export default function AdminPlansPage() {
  const t = useT();
  const [plans, setPlans] = useState<
    (ApiPlan & { user?: { _id: string; name: string; phone: string } })[]
  >([]);
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [deposits, setDeposits] = useState<DepositMap>({});
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [plansMeta, setPlansMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectorLoading, setSelectorLoading] = useState(false);
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

  // Plan list နဲ့ deposit အချက်အလက်တွေကို တစ်ပြိုင်နက် ဖတ်မယ်။ silent = true
  // ဆိုရင် table ကို မဖျောက်ဘဲ background မှာ ပြန်စစ်မယ်။
  const loadPlans = useCallback(async (page: number, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const planRes = await api.adminListPlans({ page, limit: 25 });
      setPlans(planRes.plans);
      setPlansMeta({
        page: planRes.page,
        pages: planRes.pages,
        total: planRes.total,
      });

      const planUserIds = [
        ...new Set(planRes.plans.map((plan) => plan.userId)),
      ];

      if (planUserIds.length > 0) {
        const depositRes = await api.adminDepositSummary(planUserIds);
        setDeposits((prev) => mergeDeposits(prev, depositRes.deposits));
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Failed");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadUserDeposit = useCallback(async (targetUserId: string) => {
    if (!targetUserId) return;

    try {
      const res = await api.adminDepositSummary([targetUserId]);
      setDeposits((prev) => mergeDeposits(prev, res.deposits));
    } catch {
      // deposit မရသေးတဲ့ user အတွက် error ပြဖို့ မလိုဘူး — badge က "No accepted deposit" ပဲ ပြမယ်။
    }
  }, []);

  const loadSelectorData = useCallback(async () => {
    setSelectorLoading(true);

    try {
      const requests: Promise<unknown>[] = [
        users.length
          ? Promise.resolve(null)
          : api.adminListUsers({ limit: 200 }),
        products.length
          ? Promise.resolve(null)
          : api.get<{ products: ApiProduct[] }>("/products"),
      ];

      const [userRes, productRes] = await Promise.all(requests);

      if (userRes) setUsers((userRes as { users: ApiAdminUser[] }).users);
      if (productRes) setProducts((productRes as { products: ApiProduct[] }).products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load selector data");
    } finally {
      setSelectorLoading(false);
    }
  }, [products.length, users.length]);

  // Page ထဲဝင်တိုင်း status/badge အသစ်ကို ချက်ချင်း ပြပြီး မှားနေတဲ့
  // data ကို အလိုအလျောက် ပြန်စစ်မယ်။
  const refresh = useCallback(
    async (silent = true) => {
      await loadPlans(currentPage, silent);

      if (userId) await loadUserDeposit(userId);
    },
    [currentPage, loadPlans, loadUserDeposit, userId],
  );

  useEffect(() => {
    void loadPlans(currentPage);
  }, [currentPage, loadPlans]);

  // Socket event တွေက ရောက်တာနဲ့ ချက်ချင်း ပြန်ဖတ်မယ်။
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = () => {
      void refresh();
    };

    const events = [
      "transaction:updated",
      "order:plan_created",
      "order:plan_generated",
      "order:plan_completed",
      "task:completed",
    ];

    for (const event of events) socket.on(event, handler);

    // Socket နောက်မှန် ပြန်မယ်ဆို အချိန်ကောက်တွင်း ဖြစ်ပြီးသား event တွေ လွတ်သွားနိုင်လို့
    // ချိတ်ပြီးတာနဲ့ ချက်ချင်း ပြန်ဖတ်မယ်။
    socket.on("connect", handler);

    return () => {
      for (const event of events) socket.off(event, handler);
      socket.off("connect", handler);
    };
  }, [refresh]);

  // Tab ပြန်လာတဲ့အခါနဲ့ socket မရသွားတဲ့အခါ (ကြောင့် အချိန်ကုန်မှာ) ကို
  // ဖုံးအုပ်တဲ့အတွက် ခပ်ကြားခပ်ကြား refresh လုပ်မယ်။
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, 15000);

    return () => clearInterval(timer);
  }, [refresh]);

  const depositsFor = useCallback(
    (planUserId: string) => {
      const entry = deposits[planUserId];

      return {
        accepted: entry?.accepted ?? null,
        freeAccepted: entry?.freeAccepted ?? null,
        pending: entry?.pending ?? [],
        balance: entry?.balance ?? "0.00",
      };
    },
    [deposits],
  );

  const selectedDepositCents = useMemo(() => {
    if (!userId) return null;

    const deposit = depositsFor(userId).freeAccepted;
    if (!deposit) return null;

    return Math.round(Number(money(deposit.amount)) * 100);
  }, [userId, depositsFor]);

  // Balance round — free deposit မရှိပေမယ့် အရင် deposit လုပ်ဖူးပြီး balance ရှိရင်
  // အသစ် round က user balance အပြည်အပြည်ကို base ထားမယ်။
  const selectedBalanceCents = useMemo(() => {
    if (!userId) return null;

    const { accepted, freeAccepted, balance } = depositsFor(userId);
    const cents = Math.round(Number(money(balance)) * 100);

    if (freeAccepted || !accepted || cents < 1) return null;

    return cents;
  }, [userId, depositsFor]);

  const balanceRound = useMemo(() => {
    if (!selectedBalanceCents) return null;

    return {
      cents: selectedBalanceCents,
      lo: Math.floor((selectedBalanceCents * 80) / 100),
      hi: selectedBalanceCents,
    };
  }, [selectedBalanceCents]);

  // Catalog coverage — deposit အလိုက် band ထဲက product ဘယ်လောက် ရှိလဲ
  const catalogCoverage = useMemo(() => {
    if (!selectedDepositCents) return null;

    const lo = Math.floor((selectedDepositCents * 80) / 100);
    const hi = selectedDepositCents;
    const inRange = products.filter((product) => {
      const price = Math.round(Number(money(product.price)) * 100);
      return price >= lo && price <= hi;
    }).length;

    return { lo, hi, inRange, total: products.length };
  }, [selectedDepositCents, products]);

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
      void loadPlans(currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const generate = async (plan: ApiPlan) => {
    setError("");
    setNotice("");

    const { accepted, freeAccepted, pending, balance } = depositsFor(
      plan.userId,
    );
    const balanceCents = Math.round(Number(money(balance)) * 100);

    let depositId: string | undefined;

    if (freeAccepted) {
      depositId = freeAccepted._id;
    } else if (!accepted) {
      setError(
        pending.length > 0
          ? t("admin.plans.acceptFirst")
          : t("admin.plans.depositMissing"),
      );
      return;
    } else if (balanceCents < 1) {
      setError(t("admin.plans.balanceEmpty"));
      return;
    }

    try {
      await api.adminGeneratePlan(plan._id, depositId);
      setNotice(`Order #${plan.totalOrders} generated`);
      void loadPlans(currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    }
  };

  const remove = async (plan: ApiPlan) => {
    if (!window.confirm(t("admin.deleteConfirm"))) return;

    setError("");
    try {
      await api.adminDeletePlan(plan._id);
      void loadPlans(currentPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const openTasks = async (plan: ApiPlan) => {
    setError("");
    setTaskPlan(plan);
    setTasks([]);

    try {
      const res = await api.adminListUserTasks(plan.userId, plan._id);
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

      const res = await api.adminListUserTasks(taskPlan?.userId ?? "", taskPlan?._id);
      setTasks(res.tasks);
      void loadPlans(currentPage);
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
          onClick={() => {
            const next = !isCreateOpen;
            setIsCreateOpen(next);
            if (next) {
              void loadSelectorData();
              if (userId) void loadUserDeposit(userId);
            }
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#ff6600] px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
        >
          <Plus size={16} />
          {t("admin.create")}
        </button>
        {selectorLoading && (
          <span className="text-xs font-semibold text-slate-500">
            Loading form data...
          </span>
        )}
      </div>

      {isCreateOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              {t("admin.field.name")}
              <select
                data-testid="plan-user-select"
                value={userId}
                onChange={(e) => {
                  const nextUserId = e.target.value;
                  setUserId(nextUserId);
                  if (nextUserId) void loadUserDeposit(nextUserId);
                }}
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
              {t("admin.plans.orderCount")}
              <input
                data-testid="plan-total-orders"
                type="number"
                min={1}
                max={500}
                value={totalOrders}
                onChange={(e) => setTotalOrders(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                {t("admin.plans.orderCountHint")}
              </span>
            </label>
          </div>

          <LuckyPositionsForm
            rows={luckyRows}
            totalOrders={totalOrders}
            onChange={setLuckyRows}
            products={products}
            // Free deposit ရှိရင် deposit ကို base ထားမယ်၊ မရှိရင် balance round အတွက်
            // user balance ကို base ထားမယ် — backend ရဲ့ generate base နဲ့ တူရမယ်။
            depositCents={selectedDepositCents ?? selectedBalanceCents}
          />

          {catalogCoverage && (
            <p className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
              {t("admin.lucky.coverage", {
                lo: `${(catalogCoverage.lo / 100).toFixed(2)}`,
                hi: `${(catalogCoverage.hi / 100).toFixed(2)}`,
                count: catalogCoverage.inRange,
                total: catalogCoverage.total,
                orders: Number(totalOrders),
              })}
            </p>
          )}

          {balanceRound && (
            <p className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              {t("admin.plans.balanceBase", {
                amount: `$${(balanceRound.cents / 100).toFixed(2)}`,
                lo: `$${(balanceRound.lo / 100).toFixed(2)}`,
                hi: `$${(balanceRound.hi / 100).toFixed(2)}`,
                orders: Number(totalOrders),
              })}
            </p>
          )}

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
                      {deposits.freeAccepted ? (
                        <span className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                          {t("admin.plans.depositReady")} $
                          {money(deposits.freeAccepted.amount)}
                        </span>
                      ) : deposits.accepted &&
                        Number(money(deposits.balance)) > 0 ? (
                        <span className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {t("admin.plans.balanceReady")} $
                          {money(deposits.balance)}
                        </span>
                      ) : deposits.accepted ? (
                        <span className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {t("admin.plans.depositUsed")} $
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

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {plansMeta.total} {t("admin.stats.plans")}
        </span>

        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
          >
            {t("admin.back")}
          </button>
          <span>
            {plansMeta.page} / {plansMeta.pages}
          </span>
          <button
            disabled={currentPage >= plansMeta.pages}
            onClick={() =>
              setCurrentPage((p) => Math.min(plansMeta.pages, p + 1))
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
          >
            {t("admin.refresh")}
          </button>
        </div>
      </div>
    </div>
  );
}
