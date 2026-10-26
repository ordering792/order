// src/app/withdraw/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronDown, Wallet, Lock,
  CheckCircle, Home, ClipboardList, Headphones, User
} from "lucide-react";
import CountryLanguageModal from "../components/CountryLanguageModal";
import { getStoredLang } from "../../lib/language";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { moneyNumber } from "../../lib/money";
import RequireAuth from "../components/RequireAuth";

export default function WithdrawPage() {
  const { user } = useAuth();
  const t = useT();
  const [amount, setAmount] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(getStoredLang);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalAvailable = moneyNumber(user?.balance);
  const boundWallet = user?.walletAddress || "";

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2500);
  };

  const handleMaxAmount = () => {
    setAmount(totalAvailable.toFixed(2));
  };

  const handleSubmitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!boundWallet) {
      showToast(t("withdraw.bindFirst"));
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showToast(t("withdraw.invalidAmount"));
      return;
    }
    if (Number(amount) > totalAvailable) {
      showToast(t("withdraw.insufficient"));
      return;
    }
    if (!password) {
      showToast(t("withdraw.needPassword"));
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createTransaction({
        type: "withdraw",
        amount: Number(amount).toFixed(2),
        password,
      });
      showToast(t("withdraw.submitSuccess"));
      setAmount("");
      setPassword("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("withdraw.submitFailed");
      showToast(message);
    } finally {
      setIsSubmitting(false);
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
          <Link href="/" className="text-gray-700 flex items-center">
            <ChevronLeft size={28} />
          </Link>
          <span className="font-semibold text-gray-800 text-lg">{t("withdraw.title")}</span>

          <button
            onClick={() => setIsLangModalOpen(true)}
            className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 hover:bg-gray-100 transition"
          >
            <span className={`fi fi-${selectedLanguage.code} w-6 h-4 object-cover rounded-sm shadow-sm`}></span>
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 bg-gray-50 pb-20">

          <div className="bg-gradient-to-r from-[#ff782d] to-[#ff5100] rounded-2xl p-5 text-white shadow-md relative overflow-hidden space-y-2">
            <span className="text-xs text-orange-100 font-medium block">{t("withdraw.totalAvailable")}</span>
            <div className="text-2xl font-normal tracking-tight">
              ${totalAvailable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#ff6600] flex items-center justify-center">
                <Wallet size={22} />
              </div>
              <div>
                <span className="text-xs font-bold text-gray-800 block">{t("withdraw.wallet")}</span>
                <span className="text-[10px] text-gray-400 block truncate max-w-[200px]">
                  {boundWallet || t("withdraw.noWallet")}
                </span>
              </div>
            </div>
            <Link href="/wallet_bind" className="text-xs font-bold text-[#ff6600] bg-orange-50 px-3 py-1.5 rounded-xl hover:bg-orange-100 transition">
              {boundWallet ? t("withdraw.update") : t("withdraw.bindWallet")}
            </Link>
          </div>

          <form onSubmit={handleSubmitWithdraw} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-4 bg-[#ff6600] rounded-full"></div>
              <h3 className="font-bold text-gray-800 text-xs">{t("withdraw.details")}</h3>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500">{t("withdraw.amount")}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-xs text-gray-800 font-medium focus:outline-none focus:border-[#ff6600] transition"
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 px-1">
                <span>{t("withdraw.minAmount")}</span>
                <button type="button" onClick={handleMaxAmount} className="text-[#ff6600] font-bold hover:underline">
                  {t("withdraw.maxAmount")}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500">{t("withdraw.loginPassword")}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  placeholder={t("withdraw.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-gray-800 focus:outline-none focus:border-[#ff6600] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-xl font-bold text-xs shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98] disabled:opacity-70"
            >
              {isSubmitting ? t("withdraw.processing") : t("withdraw.submit")}
            </button>
          </form>

        </div>

        <nav className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30">
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

      <CountryLanguageModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        onSelect={(lang) => setSelectedLanguage(lang)}
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
    </RequireAuth>
  );
}
