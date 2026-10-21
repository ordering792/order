"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, ShieldCheck, Smartphone, Globe, Eye, EyeOff } from "lucide-react";
import { api, ApiError, clearSession, storeSession } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useT } from "../../../lib/i18n";
import { getStoredLang } from "../../../lib/language";
import CountryLanguageModal from "../../components/CountryLanguageModal";

export default function AdminLoginPage() {
  const router = useRouter();
  const t = useT();
  const { refreshUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const selectedLanguage = getStoredLang();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await api.login({
        phone: phone.trim(),
        password: password.trim(),
      });

      if (res.user.role !== "admin" && res.user.role !== "owner") {
        clearSession();
        setError(t("admin.login.denied"));
        return;
      }

      storeSession(res.token, res.user);
      // AuthContext ကိုလည်း update ပြီးမှ admin panel မှား ဝင်ခွင့်ရမယ်။
      await refreshUser();
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("admin.login.failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ArrowLeft size={20} />
          </Link>
          <button
            onClick={() => setIsLangOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            title={selectedLanguage.name}
          >
            <Globe size={20} />
          </button>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-2xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff6600] text-white">
              <ShieldCheck size={28} />
            </span>
            <h1 className="text-lg font-bold text-slate-800">
              {t("admin.login.title")}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 focus-within:border-[#ff6600]">
              <Smartphone size={20} className="shrink-0 text-[#ff6600]" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("admin.login.phone")}
                required
                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 focus-within:border-[#ff6600]">
              <Lock size={20} className="shrink-0 text-[#ff6600]" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("admin.login.password")}
                required
                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="shrink-0 text-slate-400 transition hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] py-3 font-bold text-white shadow-lg shadow-orange-500/30 transition active:scale-[0.98] disabled:opacity-70"
            >
              {isLoading ? t("admin.login.signingIn") : t("admin.login.signIn")}
            </button>
          </form>

          <Link
            href="/login"
            className="mt-4 block text-center text-xs font-semibold text-slate-400 transition hover:text-slate-600"
          >
            {t("admin.login.backToSite")}
          </Link>
        </div>
      </div>

      <CountryLanguageModal
        isOpen={isLangOpen}
        onClose={() => setIsLangOpen(false)}
      />
    </main>
  );
}
