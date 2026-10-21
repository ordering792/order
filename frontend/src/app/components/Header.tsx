// src/components/Header.tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import CountryLanguageModal from "./CountryLanguageModal";
import { useLanguage } from "../../lib/i18n";

export default function Header() {
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const { selection } = useLanguage();

  return (
    <>
      {/* ★ sticky အစား fixed ကို သုံးပြီး အပေါ်မှာ အမြဲကပ်ထားပါတယ် */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[500px] bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="w-8 h-8 bg-[#7a3cdb] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          
          <h1 className="text-lg font-semibold text-gray-800 absolute left-1/2 -translate-x-1/2">Rakuten</h1>
          
          <button 
            onClick={() => setIsCountryModalOpen(true)}
            className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100 transition"
          >
            <span className={`fi fi-${selection.code} rounded-sm text-sm mr-1`}></span>
            <ChevronDown size={14} className="text-gray-500" />
          </button>
        </div>
      </header>

      <CountryLanguageModal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
      />
    </>
  );
}