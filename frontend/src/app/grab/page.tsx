"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Diamond,
  Search,
  X,
  Trophy,
  Zap,
  AlertCircle,
  Star,
  Home,
  ClipboardList,
  Headphones,
  User,
} from "lucide-react";
import { api, GrabOrder } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

interface GrabSummary {
  balance: string;
  totalCommission: string;
  freezeBalance: string;
  totalOrderNumber: number;
  vipLevel: string;
  commissionRate: string;
  completedCount: number;
  remainingCount: number;
  undoneCount: number;
  activeOrder: GrabOrder | null;
}

const EMPTY_SUMMARY: GrabSummary = {
  balance: "0.00",
  totalCommission: "0.00",
  freezeBalance: "0.00",
  totalOrderNumber: 0,
  vipLevel: "FREE VIP",
  commissionRate: "0.50%",
  completedCount: 0,
  remainingCount: 0,
  undoneCount: 0,
  activeOrder: null,
};

const money = (value: string | number) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function GrabPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const [summary, setSummary] = useState<GrabSummary>(EMPTY_SUMMARY);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProduct, setActiveProduct] = useState<GrabOrder | null>(null);
  const [needsDeposit, setNeedsDeposit] = useState(false);
  const [shortBy, setShortBy] = useState("0.00");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadSummary = useCallback(() => {
    api
      .grabSummary()
      .then((res) => setSummary(res.summary))
      .catch(() => {});

  }, []);

  useEffect(() => {
    if (!user) return;
    loadSummary();
  }, [user, loadSummary]);

  // Real-time: order match / complete ဖြစ်တဲ့အခါ counters ကို update လုပ်မယ်
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    if (!socket) return;

    const refresh = () => loadSummary();

    socket.on("order:completed", refresh);
    socket.on("order:submitted", refresh);
    socket.on("connect", refresh);

    return () => {
      socket.off("order:completed", refresh);
      socket.off("order:submitted", refresh);
      socket.off("connect", refresh);
    };
  }, [user, loadSummary]);

  const startMatching = async () => {
    setError("");
    setIsModalOpen(true);
    setIsLoading(true);
    setActiveProduct(null);
    setRating(0);
    setFeedback("");

    try {
      const res = await api.matchOrder();
      setActiveProduct(res.order);
      setNeedsDeposit(res.needsDeposit);
      setShortBy(res.shortBy);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("grab.matchFailed"),
      );
      setIsModalOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveProduct(null);
  };

  const handleSubmitOrder = async () => {
    if (!activeProduct) return;

    setError("");
    setIsSubmitting(true);

    try {
      await api.submitOrder(activeProduct.id, {
        rating: rating || undefined,
        feedback: feedback.trim() || undefined,
      });
      closeModal();
      router.push("/orders");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("grab.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDepositRequired = Boolean(activeProduct && needsDeposit);

  return (
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-gray-50 shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className="bg-[#ff6600] text-white px-4 py-3.5 flex items-center justify-between shadow-sm z-30 shrink-0">
          <Link href="/" className="text-white flex items-center justify-center">
            <ChevronLeft size={30} />
          </Link>
          <span className="font-bold text-lg tracking-wider">{t("grab.title")}</span>
          <div className="w-8"></div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 pb-24">

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 flex justify-between items-center relative">
            <div>
              <div className="text-2xl font-black text-[#ff6600] flex items-center">
                <span className="text-base mr-0.5">$</span>
                {money(summary.balance)}
              </div>
              <span className="text-xs font-semibold text-gray-400">{t("grab.balance")}</span>
            </div>
            <Link href="/deposit" className="w-10 h-10 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center text-white shadow-md hover:scale-105 transition">
              <Plus size={20} className="font-bold" />
            </Link>
          </div>

          <div className="bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white rounded-2xl p-5 shadow-lg relative overflow-hidden space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Diamond size={16} className="text-amber-300" />
              </div>
              <div>
                <h3 className="font-bold text-base tracking-wide">
                {summary.vipLevel}
              </h3>
                <p className="text-[11px] text-orange-100 font-medium">
                  {t("grab.commissionRate", { rate: summary.commissionRate, count: summary.totalOrderNumber })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 text-center pt-2 border-t border-white/20">
              <div>
                <div className="text-xl font-black">{summary.completedCount}</div>
                <span className="text-[10px] text-orange-100 leading-tight block mt-0.5">{t("grab.orderComplete")}</span>
              </div>
              <div>
                <div className="text-xl font-black">{summary.remainingCount}</div>
                <span className="text-[10px] text-orange-100 leading-tight block mt-0.5">{t("grab.remaining")}</span>
              </div>
              <div>
                <div className="text-xl font-black">{summary.undoneCount}</div>
                <span className="text-[10px] text-orange-100 leading-tight block mt-0.5">{t("grab.undone")}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-base font-black text-gray-800">
                  $ {money(summary.totalCommission)}
                </div>
                <span className="text-xs font-semibold text-gray-400">{t("grab.totalCommission")}</span>
              </div>
              <div>
                <div className="text-base font-black text-gray-800">
                  $ {money(summary.freezeBalance)}
                </div>
                <span className="text-xs font-semibold text-gray-400">{t("grab.freezeBalance")}</span>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-base font-black text-gray-800">{summary.totalOrderNumber}</div>
                <span className="text-xs font-semibold text-gray-400">{t("grab.orderNumber")}</span>
              </div>
              <div>
                <div className="text-base font-black text-gray-800">
                  $ {money(summary.balance)}
                </div>
                <span className="text-xs font-semibold text-gray-400">{t("grab.myBalance")}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600">
              {error}
            </p>
          )}

          <div className="pt-2">
            <button
              onClick={startMatching}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-4 rounded-full font-bold text-base shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98] disabled:opacity-60"
            >
              {isLoading ? t("grab.matching") : t("grab.beginMatching")}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
            <h4 className="font-bold text-gray-800 text-xs flex items-center">
              <AlertCircle size={14} className="text-[#ff6600] mr-1.5" />
                {t("grab.rulesTitle")}
            </h4>
            <p className="text-[11px] text-gray-500 leading-relaxed">
                {t("grab.rulesBody")}
            </p>
          </div>

        </div>

        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">Home</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-medium mt-1">Orders</span>
          </Link>

          <Link href="/grab" className="flex flex-col items-center relative -top-4 group">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center border-4 border-white shadow-md text-white transition transform group-hover:scale-105 active:scale-95 overflow-hidden">
              <img src="/images/11321466.gif" alt="Icon" className="w-full h-full object-contain" />
            </div>
          </Link>

          <Link href="/support" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Headphones size={22} />
            <span className="text-[9px] font-medium mt-1">Support</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <User size={22} />
            <span className="text-[9px] font-medium mt-1">Profile</span>
          </Link>
        </nav>

      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300">

          {isLoading && (
            <div className="bg-white w-full max-w-[300px] rounded-3xl p-6 flex flex-col items-center text-center space-y-4 shadow-2xl">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-orange-100 border-t-[#ff6600] animate-spin"></div>
                <Search size={24} className="text-[#ff6600] z-10" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-base">{t("grab.matching")}</h3>
                <p className="text-xs text-gray-400 mt-1">{t("grab.matchingStatus")}</p>
              </div>
            </div>
          )}

          {!isLoading && activeProduct && (
            <div className="bg-white w-full max-w-[380px] max-h-[90vh] rounded-3xl p-5 flex flex-col space-y-3 shadow-2xl overflow-y-auto custom-scrollbar">

              <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-gray-800 text-sm">{t("grab.orderDetail")}</h3>
                  {activeProduct.isLuckyOrder && (
                    <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                      <Zap size={10} className="text-amber-200" /> {t("grab.luckyOrder")}
                    </span>
                  )}
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <div className="flex items-start space-x-3 bg-gray-50/50 p-2.5 rounded-2xl border border-gray-100">
                <div className="w-24 h-24 bg-gray-900 rounded-xl overflow-hidden shadow-sm relative shrink-0 flex items-center justify-center border border-gray-200">
                  {activeProduct.productImage ? (
                    <img src={activeProduct.productImage} alt={activeProduct.productName} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-gray-500">{t("grab.noImage")}</span>
                  )}
                  {activeProduct.isLuckyOrder && (
                    <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-md text-amber-300 px-1.5 py-0.5 rounded text-[8px] font-bold border border-amber-400/30 flex items-center gap-0.5">
                      <Trophy size={8} /> {t("grab.lucky")}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="font-bold text-gray-800 text-xs line-clamp-2 leading-snug">{activeProduct.productName}</h4>
                  <p className="text-[10px] text-gray-500 line-clamp-4 leading-relaxed">{activeProduct.description}</p>
                  {activeProduct.code && (
                    <p className="text-[10px] font-mono text-gray-400">{activeProduct.code}</p>
                  )}
                </div>
              </div>

              <div className="bg-orange-50/60 border border-orange-100 p-3 rounded-2xl space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600 border-b border-orange-200/60 pb-1.5 mb-1">
                  <span>{t("grab.orderId")}:</span>
                  <span className="font-bold text-orange-600 font-mono">{activeProduct.orderId}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t("grab.price")}:</span>
                  <span className="font-semibold text-gray-800">$ {money(activeProduct.price)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t("grab.depositFunds")}:</span>
                  <span className="font-semibold text-rose-500">$ {money(activeProduct.requireDeposit)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t("grab.estimatedProfit")}:</span>
                  <span className="font-bold text-emerald-600">+ $ {money(activeProduct.profit)}</span>
                </div>
                <div className="border-t border-orange-200 pt-1.5 flex justify-between font-black text-gray-800 text-sm">
                  <span>{t("grab.totalAmount")}:</span>
                  <span className="text-rose-500">$ {money(activeProduct.totalAmount)}</span>
                </div>
              </div>

              {isDepositRequired && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-600 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <AlertCircle size={14} />
                    <span>{t("grab.insufficientBalance")}</span>
                  </div>
                  <p className="text-[11px]">
                    {t("grab.depositMore", { amount: money(shortBy) })}
                  </p>
                </div>
              )}

              <div className="flex flex-col items-center space-y-1 py-1">
                <span className="text-[11px] font-semibold text-gray-500">{t("grab.rateProduct")}</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="text-amber-400 transition"
                    >
                      <Star
                        size={20}
                        fill={star <= rating ? "currentColor" : "none"}
                        className={star <= rating ? "" : "text-gray-300"}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-500">{t("grab.feedback")}</span>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={t("grab.writeReview")}
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs text-gray-700 outline-none focus:border-[#ff6600] resize-none"
                ></textarea>
              </div>

              <div className="flex space-x-2 pt-1">
                <button
                  onClick={closeModal}
                  className="w-1/2 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold text-xs hover:bg-gray-200 transition"
                >
                  {t("grab.cancel")}
                </button>
                {isDepositRequired ? (
                  <Link
                    href="/deposit"
                    className="w-1/2 bg-gradient-to-r from-rose-500 to-red-600 text-white py-3 rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition text-center"
                  >
                    {t("grab.depositNow")}
                  </Link>
                ) : (
                  <button
                    onClick={handleSubmitOrder}
                    disabled={isSubmitting}
                    className="w-1/2 bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3 rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition disabled:opacity-60"
                  >
                    {isSubmitting ? t("grab.submitting") : t("grab.submitOrder")}
                  </button>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
  );
}
