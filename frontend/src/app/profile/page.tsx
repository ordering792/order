// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  User, Copy, CheckCircle, DollarSign, Wallet, MessageSquare,
  History, CreditCard, Lock, LogOut, ChevronRight,
  Home, ClipboardList, Headphones, UserPlus
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

function MenuItem({ icon, label, href }: { icon: React.ReactNode, label: string, href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between p-2 hover:bg-orange-50/50 rounded-xl transition">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#ff6600] flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm font-bold text-gray-800">{label}</span>
      </div>
      <ChevronRight size={18} className="text-gray-400" />
    </Link>
  );
}

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const t = useT();
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(3);

  // Balance ကို ချက်ချင်းစစ်ပြီး မှန်ကန်ပြန်ရမယ် (order complete ပြီးလို့ commission ပေါင်းသွားရင်)
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2500);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t("profile.copied", { text }));
  };

  const openLogoutModal = () => {
    setIsLogoutModalOpen(true);
    setLogoutCountdown(3);

    let countdown = 3;
    const interval = setInterval(() => {
      countdown--;
      setLogoutCountdown(countdown);
      if (countdown <= 0) {
        clearInterval(interval);
        setTimeout(() => {
          logout();
          window.location.href = "/login";
        }, 500);
      }
    }, 1000);
  };

  const totalAssets = user?.balance ? parseFloat(user.balance) : 0;

  return (
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-white shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className={`fixed top-5 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 z-50 transition-all duration-300 ${toast.show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <CheckCircle className="text-emerald-400" size={16} />
          <span>{toast.message}</span>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar bg-gray-50 pb-20">

          <div className="bg-[#ce5607] text-white pt-6 px-5 pb-14 shadow-md flex flex-col space-y-6 relative z-10">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 rounded-full border-4 border-white/30 bg-orange-200 flex items-center justify-center text-white shadow-inner shrink-0">
                <User size={40} className="text-white" />
              </div>

              <div className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-bold tracking-wide">{user?.name || t("auth.guest.name")}</h2>
                  {user && (
                    <span className="bg-amber-400 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                      VIP0
                    </span>
                  )}
                </div>
                {user && (
                  <div className="text-xs text-orange-100 flex items-center cursor-pointer hover:text-white" onClick={() => handleCopy(user.invitationCode || "")}>
                    {t("profile.code", { code: user.invitationCode || "..." })} <Copy size={12} className="ml-1.5" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-center pt-2">
              <div>
                <div className="text-base font-black tracking-tight">
                  {user ? `$ ${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : "$ --"}
                </div>
                <span className="text-[11px] text-orange-100 font-medium">{t("profile.totalNetAssets")}</span>
              </div>
            </div>
          </div>

          <div className="px-4 -mt-6 space-y-2 relative z-20 pb-6">
            <div className="bg-white p-3.5 rounded-2xl shadow-md border border-gray-100 space-y-2">

              {user ? (
                <>
                  <MenuItem icon={<DollarSign size={20} />} label={t("profile.depositFunds")} href="/deposit" />
                  <MenuItem icon={<Wallet size={20} />} label={t("profile.requestPayout")} href="/withdraw" />
                  <MenuItem icon={<MessageSquare size={20} />} label={t("profile.supportInbox")} href="/support" />
                  <MenuItem icon={<History size={20} />} label={t("profile.depositHistory")} href="/deposit/history" />
                  <MenuItem icon={<CreditCard size={20} />} label={t("profile.paymentMethods")} href="/wallet_bind" />
                  <MenuItem icon={<Lock size={20} />} label={t("profile.securitySettings")} href="/security" />

                  <button
                    onClick={openLogoutModal}
                    className="flex w-full items-center justify-between p-2 hover:bg-red-50/50 rounded-xl cursor-pointer transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                        <LogOut size={20} />
                      </div>
                      <span className="text-sm font-bold text-red-500">{t("profile.logout")}</span>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center py-4 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-orange-50 text-[#ff6600] flex items-center justify-center shadow-inner">
                      <Lock size={24} />
                    </div>
                    <span className="text-sm font-semibold text-gray-600 max-w-[260px]">
                      {t("auth.guest.signInToView")}
                    </span>
                    <Link
                      href="/login"
                      className="px-10 bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-2.5 rounded-full font-bold shadow-md hover:opacity-95 transition text-sm"
                    >
                      {t("auth.common.signIn")}
                    </Link>
                  </div>

                  <Link
                    href="/register"
                    className="flex w-full items-center justify-between p-2 hover:bg-orange-50/50 rounded-xl cursor-pointer transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#ff6600] flex items-center justify-center">
                        <UserPlus size={20} />
                      </div>
                      <span className="text-sm font-bold text-[#ff6600]">{t("auth.common.signUp")}</span>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </Link>
                </>
              )}

            </div>
          </div>

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
          <Link href="/profile" className="flex flex-col items-center text-[#ff6600] transition">
            <User size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.profile")}</span>
          </Link>
        </nav>

      </div>

      {isLogoutModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[300px] rounded-3xl p-6 flex flex-col items-center text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center shadow-inner animate-pulse">
              <LogOut size={28} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base">{t("profile.loggingOut")}</h3>
              <p className="text-xs text-gray-400 mt-1">
                {logoutCountdown > 0
                  ? t("profile.pleaseWait", { seconds: logoutCountdown })
                  : t("profile.loggedOut")}
              </p>
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
  );
}
