// src/app/license/page.tsx
"use client";

import Link from "next/link";
import { useT } from "../../lib/i18n";

export default function LicensePage() {
  const t = useT();
  return (
    // ★ နောက်ခံကို bg-gray-900 အစား bg-[#1e293b] (Dark Slate) ပြောင်းထားပါတယ်
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      
      {/* Mobile Container (Max Width 500px) */}
      <div className="w-full max-w-[500px] h-screen bg-white shadow-2xl flex flex-col justify-between relative overflow-hidden">
        
        {/* Top Navbar */}
        <div className="w-full bg-white px-4 py-3 flex items-center border-b shadow-sm z-30 shrink-0">
          <div className="bg-purple-700 text-white font-bold w-8 h-8 flex items-center justify-center rounded-lg mr-3">
            R
          </div>
          <span className="font-semibold text-gray-800 text-base">
            {t("auth.license.title")}
          </span>
        </div>

        {/* Main Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-5 space-y-4 text-gray-700 text-xs leading-relaxed">
          
          <div className="bg-orange-50 border border-orange-100 p-3.5 rounded-2xl">
            <h3 className="font-bold text-[#ff6600] text-sm mb-1">
              {t("auth.license.welcome")}
            </h3>
            <p className="text-gray-600">
              {t("auth.license.intro")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section1Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section1Body")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section2Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section2Body")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section3Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section3Body")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section4Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section4Body")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section5Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section5Body")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section6Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section6Body")}
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-800 text-[13px] mb-1">{t("auth.license.section7Title")}</h4>
            <p className="text-gray-600">
              {t("auth.license.section7Body")}
            </p>
          </div>

          <div className="pt-2 pb-4 text-center">
            <p className="font-semibold text-gray-400">
              {t("auth.license.acceptNote")}
            </p>
          </div>

        </div>

        {/* Bottom Action Button Area */}
        <div className="w-full bg-white border-t border-gray-100 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0">
          <Link 
            href="/" 
            className="block w-full text-center bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-full font-bold shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98]"
          >
            {t("auth.license.agree")}
          </Link>
        </div>

      </div>
    </div>
  );
}