"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiBoardRow, ApiPlan, ApiTask } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { getSocket } from "@/lib/socket";
import OrderUserCard, { type LuckyTagInput } from "../components/OrderUserCard";
import TaskPanel from "../components/TaskPanel";

const PAGE_SIZE = 24;

const REFRESH_EVENTS = [
  "transaction:updated",
  "order:plan_created",
  "order:plan_updated",
  "order:plan_generated",
  "order:plan_completed",
  "order:lucky_added",
  "order:lucky_removed",
  "task:completed",
];

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : "Request failed";
}

function toPosition(tag: LuckyTagInput) {
  return {
    orderNumber: Number(tag.orderNumber),
    productId: null,
    requiredDeposit: tag.requiredDeposit || "0.00",
    luckyCommission: tag.luckyCommission || "0.00",
  };
}

export default function AdminPlansPage() {
  const t = useT();
  const [rows, setRows] = useState<ApiBoardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [drawerRow, setDrawerRow] = useState<ApiBoardRow | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  // Card board ကို အပြည့်အဝ ပြန်ဖတ်မယ်။ silent = true ဆိုရင် loading
  // မပြဘဲ background မှာပဲ data ကို အစားထိုးမယ်။
  const loadBoard = useCallback(
    async (page: number, silent = false) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      try {
        const res = await api.adminOrderBoard({
          search: search.trim() || undefined,
          page,
          limit: PAGE_SIZE,
        });

        setRows(res.rows);
        setTotal(res.total);
        setPages(res.pages);
      } catch (err) {
        if (!silent) setError(messageOf(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [search],
  );

  // ရိုက်နေစဉ် request burst မဖြစ်အောင် search ကို 350ms debounce လုပ်မယ်။
  useEffect(() => {
    const delay = search ? 350 : 0;
    const timer = window.setTimeout(() => void loadBoard(currentPage), delay);

    return () => window.clearTimeout(timer);
  }, [currentPage, loadBoard, search]);

  const refresh = useCallback(
    () => loadBoard(currentPage, true),
    [currentPage, loadBoard],
  );

  const loadTasks = useCallback(async (row: ApiBoardRow) => {
    if (!row.plan) return;

    try {
      const res = await api.adminListUserTasks(row.user._id, row.plan._id);
      setTasks(res.tasks);
    } catch {
      // Task list ဖတ်မရရင် drawer ဟာ ပိတ်နေတယ်လို့ မထင်အောင် ကွက်လပ်ပဲ ထားမယ်။
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    let timer: number | null = null;
    const handler = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void refresh();
        if (drawerRow) void loadTasks(drawerRow);
      }, 500);
    };

    for (const event of REFRESH_EVENTS) socket.on(event, handler);
    socket.on("connect", handler);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      for (const event of REFRESH_EVENTS) socket.off(event, handler);
      socket.off("connect", handler);
    };
  }, [drawerRow, loadTasks, refresh]);

  // Socket လွဲသွားတဲ့ အချိန်ကွက်ကို ဖုံးအုပ်ဖို့ focus/visibility နဲ့ 15s tick။
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(onVisible, 15000);

    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const run = useCallback(
    async (userId: string, action: () => Promise<unknown>, success: string) => {
      setError("");
      setNotice("");
      setBusyUserId(userId);

      try {
        await action();
        setNotice(success);
        await loadBoard(currentPage, true);
        return true;
      } catch (err) {
        setError(messageOf(err));
        return false;
      } finally {
        setBusyUserId(null);
      }
    },
    [currentPage, loadBoard],
  );

  const createPlan = (userId: string, totalOrders: number) =>
    run(
      userId,
      () => api.adminCreatePlan({ userId, totalOrders, luckyPositions: [] }),
      t("admin.plans.roundOpened", { count: totalOrders }),
    );

  const updateDraft = (
    plan: ApiPlan,
    totalOrders: number,
    tags: LuckyTagInput[],
  ) =>
    run(
      plan.userId,
      () =>
        api.adminUpdatePlan(plan._id, {
          totalOrders,
          luckyPositions: tags
            .filter((tag) => tag.orderNumber !== "")
            .map(toPosition),
        }),
      t("admin.saved"),
    );

  const addLucky = (plan: ApiPlan, tag: LuckyTagInput) =>
    run(
      plan.userId,
      () => api.adminAddLuckyPosition(plan._id, toPosition(tag)),
      t("admin.plans.luckyAdded", { number: tag.orderNumber }),
    );

  // Grab မလုပ်ရသေးတဲ့ order ပဲ backend က ခွင့်တယ် — user စတင်ပြီးသားရင်
  // 409 ပြန်လာပြီး ဒီ error row မှာပဲ ပေါ်တယ်။
  const removeLucky = async (plan: ApiPlan, orderNumber: number) => {
    if (
      !window.confirm(
        t("admin.plans.luckyRemoveConfirm", { number: orderNumber }),
      )
    ) {
      return;
    }

    await run(
      plan.userId,
      () => api.adminRemoveLuckyPosition(plan._id, orderNumber),
      t("admin.plans.luckyRemoved", { number: orderNumber }),
    );
  };

  const generate = (plan: ApiPlan) =>
    run(
      plan.userId,
      () => api.adminGeneratePlan(plan._id),
      t("admin.plans.ordersGenerated", { count: plan.totalOrders }),
    );

  const remove = async (plan: ApiPlan) => {
    if (!window.confirm(t("admin.deleteConfirm"))) return;

    await run(
      plan.userId,
      () => api.adminDeletePlan(plan._id),
      t("admin.plans.roundDeleted"),
    );
  };

  const openTasks = async (row: ApiBoardRow) => {
    setDrawerRow(row);
    await loadTasks(row);
  };

  const completeTask = async (task: ApiTask) => {
    setError("");
    setBusyTaskId(task._id);

    try {
      await api.completeTask(task._id);
      if (drawerRow) await loadTasks(drawerRow);
      await loadBoard(currentPage, true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusyTaskId(null);
    }
  };

  // Drawer ထဲက count တွေက board ရဲ့ latest data နဲ့ အမြဲ တစ်ထွေတည်းနေမယ်။
  const liveDrawer = drawerRow
    ? (rows.find((row) => row.user._id === drawerRow.user._id) ?? drawerRow)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            data-testid="board-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t("admin.search")}
            className="w-full bg-transparent text-sm text-slate-700 outline-none"
          />
        </label>
        <span className="text-xs font-semibold text-slate-500">
          {total} · {currentPage} / {pages}
        </span>
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

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {t("admin.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {t("admin.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3">
          {rows.map((row) => (
            <OrderUserCard
              key={`${row.user._id}:${row.plan?._id ?? "none"}:${row.plan?.totalOrders ?? 0}`}
              row={row}
              busy={busyUserId === row.user._id}
              onCreate={createPlan}
              onUpdateDraft={updateDraft}
              onAddLucky={addLucky}
              onRemoveLucky={removeLucky}
              onGenerate={generate}
              onDelete={remove}
              onOpenTasks={openTasks}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {currentPage} / {pages} ({total})
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.back")}
            </button>
            <button
              data-testid="board-next"
              disabled={currentPage >= pages}
              onClick={() => setCurrentPage((page) => Math.min(pages, page + 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.next")}
            </button>
          </div>
        </div>
      )}

      {liveDrawer?.plan && (
        <div
          data-testid="tasks-drawer"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={() => setDrawerRow(null)}
        >
          <div
            className="w-full max-w-3xl"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <TaskPanel
              userName={liveDrawer.user.name}
              completedCount={liveDrawer.plan.completedCount}
              totalOrders={liveDrawer.plan.totalOrders}
              tasks={tasks}
              busyTaskId={busyTaskId}
              onComplete={completeTask}
              onClose={() => setDrawerRow(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
