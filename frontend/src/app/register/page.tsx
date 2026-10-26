// app/register/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Globe,
  User,
  Smartphone,
  Lock,
  Gift,
  Eye,
  EyeOff,
  ChevronDown,
  ArrowLeft,
} from "lucide-react";
import CountryModal from "../components/CountryModal";
import CountryLanguageModal from "../components/CountryLanguageModal";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { useT } from "../../lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const t = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState({
    name: "United States",
    code: "+1",
    flag: "us",
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [referredByCode, setReferredByCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await register({
        name,
        phone: phone.trim(),
        password: password.trim(),
        invitationCode: invitationCode.trim(),
        referredByCode: referredByCode?.trim() || undefined,
      });
      router.push("/");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t("auth.register.failed");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f2f3f6] flex justify-center">
      <div className="relative flex min-h-screen w-full max-w-[500px] flex-col overflow-hidden bg-white shadow-[0_0_35px_rgba(0,0,0,0.08)]">

        <section className="relative h-[250px] w-full shrink-0">
          <Image
            src="/images/image.png"
            alt="Rakuten Shopping"
            fill
            priority
            sizes="(max-width: 500px) 100vw, 500px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/20" />

          <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4">
            <Link href="/login" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/40">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold tracking-wider text-white">
              Rakuten
            </h1>
            <button
              onClick={() => setIsLangModalOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/40"
            >
              <Globe size={20} />
            </button>
          </header>

          <div className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-10 h-[45px]">
            <svg viewBox="0 0 500 45" preserveAspectRatio="none" className="block h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 0 C65 15 110 30 175 18 C230 8 255 1 300 15 C365 34 410 48 500 27 L500 45 L0 45 Z" fill="#ffffff" />
            </svg>
          </div>
        </section>

        <section className="relative z-10 flex flex-1 flex-col px-4 pt-2 pb-4">
          <form onSubmit={handleSubmit} className="w-full rounded-[28px] border border-orange-100 bg-white p-6 shadow-xl space-y-4">

            <div className="flex items-center border-b border-gray-200 py-3 px-1 focus-within:border-[#ff6600]">
              <User className="mr-3 shrink-0 text-[#ff6600]" size={24} strokeWidth={2} />
              <input
                type="text"
                placeholder={t("auth.register.usernamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>

            <div className="flex items-center border-b border-gray-200 py-3 px-1 focus-within:border-[#ff6600]">
              <Smartphone className="mr-3 shrink-0 text-[#ff6600]" size={24} strokeWidth={2} />
              <button
                type="button"
                onClick={() => setIsCountryModalOpen(true)}
                className="flex shrink-0 items-center border-r border-gray-200 pr-3 mr-3 cursor-pointer select-none"
              >
                <span className={`fi fi-${selectedCountry.flag} w-6 h-4 object-cover rounded-sm mr-1.5 shadow-sm`}></span>
                <span className="text-sm font-bold text-gray-700">{selectedCountry.code}</span>
                <ChevronDown size={14} className="ml-1 text-gray-400" />
              </button>
              <input
                type="tel"
                placeholder={t("auth.common.phone")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>

            <div className="flex items-center border-b border-gray-200 py-3 px-1 focus-within:border-[#ff6600]">
              <Lock className="mr-3 shrink-0 text-[#ff6600]" size={24} strokeWidth={2} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.common.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="ml-2 shrink-0 text-gray-400 transition hover:text-gray-600">
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <div className="flex items-center border-b border-gray-200 py-3 px-1 focus-within:border-[#ff6600]">
              <Gift className="mr-3 shrink-0 text-[#ff6600]" size={24} strokeWidth={2} />
              <input
                type="text"
                placeholder={t("auth.register.invitationPlaceholder")}
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                required
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>

            <div className="flex items-center border-b border-gray-200 py-3 px-1 focus-within:border-[#ff6600]">
              <Gift className="mr-3 shrink-0 text-[#ff6600]" size={24} strokeWidth={2} />
              <input
                type="text"
                placeholder={t("auth.register.referredPlaceholder")}
                value={referredByCode}
                onChange={(e) => setReferredByCode(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>

            {error && (
              <p className="text-xs font-bold text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-full font-bold shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98] mt-2 disabled:opacity-70"
            >
              {isLoading ? t("auth.register.creating") : t("auth.common.signUp")}
            </button>

            <div className="text-center pt-2">
              <span className="text-xs text-gray-500">{t("auth.register.haveAccount")}{" "}</span>
              <Link href="/login" className="text-xs font-bold text-[#ff6600] hover:underline">
                {t("auth.common.signIn")}
              </Link>
            </div>
          </form>
        </section>
      </div>

      <CountryModal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
        onSelect={(country) => setSelectedCountry(country)}
      />
      <CountryLanguageModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
      />
    </main>
  );
}
