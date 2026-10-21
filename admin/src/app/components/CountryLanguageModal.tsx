// src/components/CountryLanguageModal.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { flagCode } from "@/lib/language";
import { useLanguage, useT } from "@/lib/i18n";

const fallbackLanguages = [
  { name: "English (United States)", code: "us" },
  { name: "Español (Spain)", code: "es" },
  { name: "Português (Brazil)", code: "br" },
  { name: "العربية (Arabic)", code: "sa" },
  { name: "हिन्दी (India)", code: "in" },
  { name: "日本語 (Japan)", code: "jp" },
  { name: "ไทย (Thailand)", code: "th" },
  { name: "한국어 (Korea)", code: "kr" },
  { name: "中文 (China)", code: "cn" },
];

interface CountryLanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (language: { name: string; code: string }) => void;
}

export default function CountryLanguageModal({ isOpen, onClose, onSelect }: CountryLanguageModalProps) {
  const [languages, setLanguages] = useState(fallbackLanguages);
  const { selection, select } = useLanguage();
  const t = useT();

  useEffect(() => {
    if (!isOpen) return;
    api.getLanguages()
      .then((res) => {
        const mapped = (res.languages as { name: string; code: string }[]).map((l) => ({
          name: l.name,
          code: flagCode(l.code),
        }));
        if (mapped.length > 0) setLanguages(mapped);
      })
      .catch(() => {});
  }, [isOpen]);

  const handleSelect = (lang: { name: string; code: string }) => {
    select(lang);
    onSelect?.(lang);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex flex-col justify-end">
      
      {/* Modal Box */}
      <div 
        className="bg-white w-full max-w-[500px] mx-auto rounded-t-[30px] p-5 flex flex-col h-[70vh] animate-slide-up"
        style={{ animation: "slideUp 0.3s ease-out forwards" }}
      >
        
        {/* Header (ခင်ဗျားပေးထားတဲ့ ကုဒ်အတိုင်း) */}
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <h3 className="font-bold text-gray-800 text-base">{t("langModal.title")}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 cursor-pointer">
            <X size={24} />
          </button>
        </div>

        {/* Language List Container */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 divide-y divide-gray-50 custom-scrollbar">
          {languages.map((lang, index) => (
            <div 
              key={index} 
              onClick={() => handleSelect(lang)}
              className="flex items-center justify-between p-3 hover:bg-orange-50 rounded-xl cursor-pointer transition"
            >
              <div className="flex items-center space-x-3">
                {/* ★ အလံပုံကို အရင်အတိုင်း fi fi- (CSS Class) ပြန်ပြောင်းထားပါတယ် */}
                <span className={`fi fi-${lang.code} rounded-sm text-2xl`}></span>
                <span className="text-sm font-semibold text-gray-800">{lang.name}</span>
              </div>
              
              {/* Checkmark (ရွေးထားတဲ့ language ကို ပြ) */}
              {lang.code === selection.code && (
                <span className="text-orange-600 text-lg font-bold">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        /* Scrollbar ကို ပိန်ပြီး လိမ္မော်ရောင် ဖြစ်အောင် လုပ်ထားပါတယ် */
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ff782d;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}