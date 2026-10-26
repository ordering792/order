"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Home, Clock, Image as ImageIcon, X
} from "lucide-react";
import { api, ApiTransaction } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useT } from "../../../lib/i18n";
import { formatMoney } from "../../../lib/money";
import RequireAuth from "../../components/RequireAuth";

export default function DepositHistoryPage() {
  const { user } = useAuth();
  const t = useT();
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.myTransactions()
      .then((res) => {
        setTransactions(res.transactions.filter((tx) => tx.type === "deposit"));
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [user]);

  const statusLabel = (status: string) => {
    if (status === "accepted") return t("depositHistory.completed");
    if (status === "rejected") return t("depositHistory.rejected");
    return t("depositHistory.pending");
  };

  const statusClass = (status: string) => {
    if (status === "accepted") return "bg-emerald-50 text-emerald-600 border-emerald-200";
    if (status === "rejected") return "bg-red-50 text-red-600 border-red-200";
    return "bg-amber-50 text-amber-600 border-amber-200";
  };

  return (
    <RequireAuth>
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-gray-50 shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className="w-full bg-[#ff6600] text-white px-4 py-3.5 flex justify-between items-center shadow-sm z-30 shrink-0">
          <Link href="/deposit" className="text-white flex items-center">
            <ChevronLeft size={28} />
          </Link>
          <span className="font-bold text-base tracking-wider">{t("depositHistory.title")}</span>
          <Link href="/" className="text-white flex items-center">
            <Home size={22} />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-3 bg-gray-50">

          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">{t("depositHistory.loading")}</div>
          ) : transactions.length > 0 ? (
            transactions.map((item) => (
              <div key={item._id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 text-xs">

                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="font-mono font-bold text-gray-700">{item._id.slice(-12).toUpperCase()}</span>
                  <span className={`flex items-center gap-1 font-bold px-2.5 py-0.5 rounded-full border text-[10px] ${statusClass(item.status)}`}>
                    <Clock size={12} /> {statusLabel(item.status)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 block text-[10px]">{t("depositHistory.methodNetwork")}</span>
                    <span className="font-bold text-gray-800">USDT (TRC20)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 block text-[10px]">{t("depositHistory.amount")}</span>
                    <span className="font-black text-rose-500 text-sm">
                      ${formatMoney(item.amount)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-[10px] text-gray-400">
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  {item.proofScreenshot && (
                    <button
                      onClick={() => setSelectedImage(item.proofScreenshot!)}
                      className="text-[#ff6600] font-bold hover:underline flex items-center gap-0.5"
                    >
                      <ImageIcon size={14} /> {t("depositHistory.viewProof")}
                    </button>
                  )}
                </div>

              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 py-10 text-sm">
              {t("depositHistory.empty")}
            </div>
          )}

        </div>

      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 relative flex flex-col items-center space-y-3">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
            >
              <X size={24} />
            </button>
            <h4 className="font-bold text-xs text-gray-800">{t("depositHistory.proofTitle")}</h4>
            <div className="w-full h-80 bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center border">
              <img
                src={selectedImage}
                alt="Proof"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
    </RequireAuth>
  );
}
