"use client";

import { ApiTask } from "@/lib/api";
import { money } from "@/lib/money";
import { useT } from "@/lib/i18n";

interface TaskPanelProps {
  userName: string;
  completedCount: number;
  totalOrders: number;
  tasks: ApiTask[];
  busyTaskId: string | null;
  onComplete: (task: ApiTask) => void;
  onClose: () => void;
}

// Plan တစ်ခုရဲ့ order စာရင်း — complete ခေါ်တာကိုလည်း admin လုပ်လို့ရပါတယ်။
export default function TaskPanel({
  userName,
  completedCount,
  totalOrders,
  tasks,
  busyTaskId,
  onComplete,
  onClose,
}: TaskPanelProps) {
  const t = useT();

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {t("admin.plans.tasks")} — {userName}
          </p>
          <p className="text-xs text-slate-500">
            {t("admin.stats.completed")}: {completedCount} / {totalOrders}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {t("admin.cancel")}
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">{t("admin.field.title")}</th>
              <th className="px-4 py-2">{t("admin.field.price")}</th>
              <th className="px-4 py-2">{t("admin.field.status")}</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.empty")}
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task._id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500">{task.orderNumber}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800">
                    {task.productName}
                    {task.isLuckyOrder && (
                      <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        LUCKY
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700">${money(task.price)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                        task.status === "completed"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {task.status === "completed"
                        ? t("admin.status.accepted")
                        : task.status === "assigned"
                          ? t("admin.status.pending")
                          : t("admin.status.draft")}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                        {task.status === "assigned" && (
                      <button
                        onClick={() => onComplete(task)}
                        disabled={busyTaskId === task._id}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {t("admin.action.accept")}
                      </button>
                    )}
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
