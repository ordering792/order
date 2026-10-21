// src/components/CountryModal.tsx
"use client";
import { useState } from "react";
import { X, Search } from "lucide-react";
import { useT } from "../../lib/i18n";

const countries = [
  // --- North America ---
  { name: "United States", code: "+1", flag: "us" },
  { name: "Mexico", code: "+52", flag: "mx" },

  // --- Europe ---
  { name: "United Kingdom", code: "+44", flag: "gb" },
  { name: "Germany", code: "+49", flag: "de" },
  { name: "France", code: "+33", flag: "fr" },
  { name: "Italy", code: "+39", flag: "it" },
  { name: "Spain", code: "+34", flag: "es" },
  { name: "Netherlands", code: "+31", flag: "nl" },
  { name: "Switzerland", code: "+41", flag: "ch" },
  { name: "Sweden", code: "+46", flag: "se" },
  { name: "Poland", code: "+48", flag: "pl" },
  { name: "Belgium", code: "+32", flag: "be" },
  { name: "Austria", code: "+43", flag: "at" },
  { name: "Norway", code: "+47", flag: "no" },
  { name: "Denmark", code: "+45", flag: "dk" },
  { name: "Finland", code: "+358", flag: "fi" },
  { name: "Ireland", code: "+353", flag: "ie" },
  { name: "Portugal", code: "+351", flag: "pt" },
  { name: "Greece", code: "+30", flag: "gr" },
  { name: "Czech Republic", code: "+420", flag: "cz" },
  { name: "Romania", code: "+40", flag: "ro" },
  { name: "Hungary", code: "+36", flag: "hu" },
  { name: "Ukraine", code: "+380", flag: "ua" },

  // --- South Asia ---
  { name: "India", code: "+91", flag: "in" },
  { name: "Pakistan", code: "+92", flag: "pk" },
  { name: "Bangladesh", code: "+880", flag: "bd" },
  { name: "Nepal", code: "+977", flag: "np" },
  { name: "Sri Lanka", code: "+94", flag: "lk" },

  // --- East & Southeast Asia ---
  { name: "China", code: "+86", flag: "cn" },
  { name: "Japan", code: "+81", flag: "jp" },
  { name: "South Korea", code: "+82", flag: "kr" },
  { name: "Thailand", code: "+66", flag: "th" },
  { name: "Singapore", code: "+65", flag: "sg" },
  { name: "Malaysia", code: "+60", flag: "my" },
  { name: "Indonesia", code: "+62", flag: "id" },
  { name: "Vietnam", code: "+84", flag: "vn" },
  { name: "Philippines", code: "+63", flag: "ph" },
  { name: "Cambodia", code: "+855", flag: "kh" },
  { name: "Laos", code: "+856", flag: "la" },

  // --- Middle East & Central Asia ---
  { name: "United Arab Emirates", code: "+971", flag: "ae" },
  { name: "Saudi Arabia", code: "+966", flag: "sa" },
  { name: "Turkey", code: "+90", flag: "tr" },
  { name: "Qatar", code: "+974", flag: "qa" },

  // --- South America & Oceania ---
  { name: "Brazil", code: "+55", flag: "br" },
  { name: "Australia", code: "+61", flag: "au" },
  { name: "New Zealand", code: "+64", flag: "nz" },
];

interface CountryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (country: { name: string; code: string; flag: string }) => void;
}

export default function CountryModal({ isOpen, onClose, onSelect }: CountryModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const t = useT();

  if (!isOpen) return null;

  const filteredCountries = countries.filter((country) =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country.code.includes(searchTerm)
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center transition-opacity duration-300">
      <div 
        className="bg-white w-full max-w-[500px] h-[75vh] rounded-t-[30px] p-5 flex flex-col transform transition-transform duration-300 shadow-2xl"
        style={{ animation: "slideUp 0.3s ease-out forwards" }}
      >
        
        {/* Modal Header */}
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <h3 className="font-bold text-gray-800 text-base">{t("auth.country.title")}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 cursor-pointer">
            <X size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-3 text-gray-400" />
          <input 
            type="text" 
            placeholder={t("auth.country.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-xl outline-none text-sm text-gray-700 border border-gray-200 focus:border-[#ff6600]"
          />
        </div>

        {/* Country List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 divide-y divide-gray-50 custom-scrollbar">
          {filteredCountries.length > 0 ? (
            filteredCountries.map((country, index) => (
              <div 
                key={index} 
                onClick={() => {
                  onSelect(country);
                  onClose();
                }}
                className="flex items-center justify-between p-2.5 hover:bg-orange-50 rounded-xl cursor-pointer transition"
              >
                <div className="flex items-center space-x-3">
                  <span className={`fi fi-${country.flag} w-7 h-5 object-cover rounded shadow-sm`}></span>
                  <span className="text-sm font-semibold text-gray-800">{country.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-500">{country.code}</span>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-6">{t("auth.country.empty")}</div>
          )}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ff782d;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}