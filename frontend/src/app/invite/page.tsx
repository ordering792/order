// src/app/invite/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Gift, Copy, Info, CheckCircle, ChevronDown,
  Home, ClipboardList, Headphones, User
} from "lucide-react";
import CountryLanguageModal from "../components/CountryLanguageModal";
import { getStoredLang } from "../../lib/language";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import RequireAuth from "../components/RequireAuth";

export default function InvitePage() {
  const { user } = useAuth();
  const t = useT();
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(getStoredLang);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });

  const inviteCode = user?.invitationCode || "LOADING";

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode)
      .then(() => showToast(t("invite.copySuccess")))
      .catch(() => showToast(t("invite.copyFailed")));
  };

  return (
    <RequireAuth>
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-white shadow-2xl flex flex-col justify-between relative overflow-hidden">

        {/* Toast Notification */}
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 z-50 transition-all duration-300 ${toast.show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <CheckCircle className="text-emerald-400" size={16} />
          <span>{toast.message}</span>
        </div>

        {/* Top Navbar */}
        <div className="w-full bg-white px-4 py-3 flex justify-between items-center border-b shadow-sm z-30 shrink-0">
          <div className="bg-[#7a3cdb] text-white font-bold w-8 h-8 flex items-center justify-center rounded-lg">
            R
          </div>
          <span className="font-semibold text-gray-800 text-base">{t("invite.title")}</span>
          
          <button 
            onClick={() => setIsLangModalOpen(true)}
            className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 hover:bg-gray-100 transition"
          >
            <span className={`fi fi-${selectedLanguage.code} w-6 h-4 object-cover rounded-sm shadow-sm`}></span>
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 flex flex-col items-center justify-center space-y-5 bg-gray-50">
          
          {/* Icon Header */}
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 shadow-inner animate-pulse">
            <Gift size={32} />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-base font-bold text-gray-800">{t("invite.yourFriends")}</h2>
            <p className="text-xs text-gray-500 max-w-[260px]">
              {t("invite.subtitle")}
            </p>
          </div>

          {/* Big Invite Card */}
          <div className="w-full bg-gradient-to-br from-[#ff782d] to-[#ff5100] rounded-2xl p-5 text-white shadow-xl flex flex-col items-center space-y-3.5 relative overflow-hidden">
            {/* Background Blur Effects */}
            <div className="absolute -right-10 -bottom-10 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
            <div className="absolute -left-10 -top-10 w-28 h-28 bg-black/10 rounded-full blur-xl pointer-events-none"></div>

            <span className="text-[11px] font-medium uppercase tracking-widest text-orange-100">
              {t("invite.yourCode")}
            </span>
            
            {/* Code Box */}
            <div className="bg-white/15 backdrop-blur-md border border-white/20 w-full py-3.5 rounded-xl flex items-center justify-center shadow-inner">
              <span className="text-xl sm:text-2xl font-black tracking-widest font-mono">
                {inviteCode}
              </span>
            </div>

            {/* Copy Button */}
            <button 
              onClick={handleCopyCode}
              className="w-full bg-white text-orange-600 hover:bg-orange-50 active:scale-95 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
            >
              <Copy size={16} />
              <span>{t("invite.copyCode")}</span>
            </button>
          </div>

          {/* Additional Instruction Card */}
          <div className="w-full bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm space-y-1.5 text-left">
            <div className="flex items-center space-x-2 text-gray-800 font-bold text-xs">
              <Info className="text-[#ff6600]" size={16} />
              <span>{t("invite.howItWorks")}</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {t("invite.howItWorksBody")}
            </p>
          </div>

        </div>

        {/* Bottom Navigation Bar */}
        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.home")}</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.orders")}</span>
          </Link>
          
          {/* Center Floating Action Button */}
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

      {/* Language Modal */}
      <CountryLanguageModal 
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        onSelect={(lang) => setSelectedLanguage(lang)}
      />

      {/* Custom Scrollbar Style */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
    </RequireAuth>
  );
}