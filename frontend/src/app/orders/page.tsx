// src/app/orders/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, Home, ClipboardList, Headphones, User
} from "lucide-react";
import CountryLanguageModal from "../components/CountryLanguageModal";
import { getStoredLang } from "../../lib/language";
import { api, ApiTask, ApiError } from "../../lib/api";
import { money } from "../../lib/money";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import RequireAuth from "../components/RequireAuth";

export default function OrdersPage() {
  const { user } = useAuth();
  const t = useT();
  const [filter, setFilter] = useState("all");
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(getStoredLang);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [plan, setPlan] = useState<{
    _id: string;
    totalOrders: number;
    completedCount: number;
    status: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = () => {
    setLoading(true);
    api
      .myOrders()
      .then((res) => {
        setTasks(res.tasks);
        setPlan(res.plan);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const completedCount =
    plan?.completedCount ?? tasks.filter((t) => t.status === "completed").length;
  const totalOrders = plan?.totalOrders ?? tasks.length;
  const progressPercent =
    totalOrders > 0 ? Math.min(100, Math.round((completedCount / totalOrders) * 100)) : 0;

  const completeOrder = async (task: ApiTask) => {
    setActionError("");
    setCompletingId(task._id);

    try {
      await api.completeTask(task._id);
      load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : t("orders.completeFailed"),
      );
    } finally {
      setCompletingId(null);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "complete") return task.status === "completed";
    return task.status === "assigned";
  });

  return (
    <RequireAuth>
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-white shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className="w-full bg-white px-4 py-3 flex justify-between items-center border-b shadow-sm z-30 shrink-0">
          <div className="bg-[#7a3cdb] text-white font-bold w-8 h-8 flex items-center justify-center rounded-lg">
            R
          </div>
          <span className="font-semibold text-gray-800 text-lg">{t("orders.title")}</span>

          <button
            onClick={() => setIsLangModalOpen(true)}
            className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 hover:bg-gray-100 transition"
          >
            <span className={`fi fi-${selectedLanguage.code} w-6 h-4 object-cover rounded-sm shadow-sm`}></span>
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </button>
        </div>

        <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex justify-between items-center z-20 shrink-0 shadow-sm overflow-x-auto no-scrollbar">
          {(["all", "pending", "complete"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-xs transition shadow-sm ${
                filter === tab
                ? "bg-[#ff6600] text-white font-bold"
                : "bg-gray-100 text-gray-600 font-semibold hover:bg-orange-50 hover:text-[#ff6600]"
              }`}
            >
              {t(`orders.filter${tab === "all" ? "All" : tab === "pending" ? "Pending" : "Complete"}`)}
            </button>
          ))}
        </div>

        {totalOrders > 0 && (
          <div className="bg-white border-b border-gray-100 px-4 py-3 shrink-0">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1.5">
              <span>{t("orders.progress")}</span>
              <span>
                {completedCount} / {totalOrders}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {actionError && (
          <p className="px-4 py-2 text-xs font-bold text-red-500 bg-red-50">
            {actionError}
          </p>
        )}

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-3 bg-gray-50 pb-20">

          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">{t("orders.loading")}</div>
          ) : filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <div key={task._id} className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 flex flex-col space-y-2.5">

                <div className="flex justify-between items-center text-xs text-gray-400 border-b pb-2">
                  <span>{t("orders.orderNumber", { num: task.orderNumber })}</span>
                  {task.code && (
                    <span className="text-gray-400">{t("orders.code")}: {task.code}</span>
                  )}
                  <span
                    className={`font-bold px-2.5 py-0.5 rounded-md text-[11px] ${
                      task.status === "completed" ? "text-emerald-600 bg-emerald-50" :
                      "text-amber-600 bg-amber-50"
                    }`}
                  >
                    {task.status === "completed" ? t("orders.complete") : t("orders.pending")}
                  </span>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="w-16 h-16 relative rounded-xl overflow-hidden shrink-0 border border-gray-100 bg-gray-50">
                    {task.imageUrl ? (
                      <img
                        src={task.imageUrl}
                        alt={task.productName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">{t("orders.noImage")}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-800 truncate">{task.productName}</h3>
                      {task.category && (
                        <span className="shrink-0 text-[10px] font-semibold text-[#ff6600] bg-orange-50 px-1.5 py-0.5 rounded">
                          {task.category}
                        </span>
                      )}
                    </div>
                    {task.usage && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{task.usage}</p>
                    )}
                    {!task.usage && task.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{task.description}</p>
                    )}
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#ff6600]">${money(task.price)}</span>
                        {task.isLuckyOrder && (
                          <span className="text-[10px] font-bold text-white bg-gradient-to-r from-amber-400 to-amber-600 px-2 py-0.5 rounded-full">LUCKY</span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600">
                        {t("orders.commission")} +${money(task.commission)}
                      </span>
                    </div>
                  </div>
                </div>

                {task.status === "assigned" && (
                  <button
                    onClick={() => completeOrder(task)}
                    disabled={completingId === task._id}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white text-xs font-bold shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                  >
                    {completingId === task._id
                      ? t("orders.loading")
                      : t("orders.completeOrder")}
                  </button>
                )}

              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 py-10 text-sm">
              {t("orders.empty")}
            </div>
          )}

        </div>

        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.home")}</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-[#ff6600] transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.orders")}</span>
          </Link>

          <Link href="/grab" className="flex flex-col items-center relative -top-4 group">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center border-4 border-white shadow-md text-white transition transform group-hover:scale-105 active:scale-95 overflow-hidden">
              <img src="/images/11321466.gif" alt="Icon" className="w-full h-full object-contain" />
            </div>
          </Link>

          <Link href="/support" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Headphones size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.support")}</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <User size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.profile")}</span>
          </Link>
        </nav>

      </div>

      <CountryLanguageModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        onSelect={(lang) => setSelectedLanguage(lang)}
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
    </RequireAuth>
  );
}
