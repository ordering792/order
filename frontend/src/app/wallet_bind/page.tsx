// src/app/wallet/bind/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Wallet, AlertCircle, CheckCircle,
  Home, ClipboardList, Headphones, User
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import RequireAuth from "../components/RequireAuth";

export default function BindWalletPage() {
  const { refreshUser } = useAuth();
  const t = useT();
  const [network, setNetwork] = useState("TRC20");
  const [walletAddress, setWalletAddress] = useState("");
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });
  const [isSaving, setIsSaving] = useState(false);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2500);
  };

  const handleSaveWallet = async (e: React.FormEvent) => {
    e.preventDefault();

    const address = walletAddress.trim();
    if (!address) {
      showToast(t("walletBind.invalidAddress"));
      return;
    }
    if (address.length < 10 || address.length > 100) {
      showToast(t("walletBind.addressLength"));
      return;
    }

    const confirmSave = window.confirm(t("walletBind.confirmSave"));
    if (!confirmSave) return;

    setIsSaving(true);
    try {
      await api.updateWalletAddress(address);
      await refreshUser();
      showToast(t("walletBind.saveSuccess"));
      setTimeout(() => {
        window.location.href = "/withdraw";
      }, 1500);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 400
            ? t("walletBind.addressLength")
            : err.message
          : t("walletBind.saveFailed");
      showToast(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <RequireAuth>
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-white shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className={`fixed top-5 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-xs px-5 py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 z-50 transition-all duration-300 ${toast.show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <CheckCircle className="text-emerald-400" size={18} />
          <span>{toast.message}</span>
        </div>

        <div className="w-full bg-white px-4 py-3 flex justify-between items-center border-b shadow-sm z-30 shrink-0">
          <Link href="/withdraw" className="text-gray-700 flex items-center">
            <ChevronLeft size={28} />
          </Link>
          <span className="font-semibold text-gray-800 text-lg">{t("walletBind.title")}</span>
          <div className="w-6"></div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 bg-gray-50">

          <form onSubmit={handleSaveWallet} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-4 bg-[#ff6600] rounded-full"></div>
              <h3 className="font-bold text-gray-800 text-xs">{t("walletBind.section")}</h3>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center space-x-1.5 text-amber-600 font-bold text-[11px]">
                <AlertCircle size={14} />
                <span>{t("walletBind.notice")}</span>
              </div>
              <p className="text-[10px] text-gray-600 leading-tight">
                {t("walletBind.noticeBody")}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500">{t("walletBind.selectNetwork")}</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center space-x-2 border rounded-xl p-3 cursor-pointer transition ${
                  network === "TRC20" ? "border-[#ff6600] bg-orange-50/40" : "border-gray-200 bg-gray-50/50 hover:border-[#ff6600]"
                }`}>
                  <input
                    type="radio"
                    name="wallet_network"
                    value="TRC20"
                    checked={network === "TRC20"}
                    onChange={() => setNetwork("TRC20")}
                    className="text-[#ff6600] focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">TRC20</span>
                    <span className="text-[9px] text-gray-400 block">{t("walletBind.tronNetwork")}</span>
                  </div>
                </label>

                <label className={`flex items-center space-x-2 border rounded-xl p-3 cursor-pointer transition ${
                  network === "ERC20" ? "border-[#ff6600] bg-orange-50/40" : "border-gray-200 bg-gray-50/50 hover:border-[#ff6600]"
                }`}>
                  <input
                    type="radio"
                    name="wallet_network"
                    value="ERC20"
                    checked={network === "ERC20"}
                    onChange={() => setNetwork("ERC20")}
                    className="text-[#ff6600] focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">ERC20</span>
                    <span className="text-[9px] text-gray-400 block">{t("walletBind.ethNetwork")}</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500">{t("walletBind.walletAddress")}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <Wallet size={16} />
                </span>
                <input
                  type="text"
                  placeholder={t("walletBind.addressPlaceholder")}
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-xs text-gray-800 font-medium focus:outline-none focus:border-[#ff6600] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-xl font-bold text-xs shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98] disabled:opacity-70"
            >
              {isSaving ? t("walletBind.saving") : t("walletBind.save")}
            </button>
          </form>

        </div>

        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.home")}</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.orders")}</span>
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

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
    </RequireAuth>
  );
}
