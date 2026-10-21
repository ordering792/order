"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

export function LoginWall({ messageKey = "auth.guest.signInToView" }: { messageKey?: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-orange-50 text-[#ff6600] flex items-center justify-center shadow-inner mb-4">
        <Lock size={30} />
      </div>
      <p className="text-sm font-semibold text-gray-600 mb-6 max-w-[300px]">
        {t(messageKey)}
      </p>
      <div className="flex flex-col space-y-3 w-full max-w-[280px]">
        <Link
          href="/login"
          className="w-full bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3 rounded-full font-bold shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98] text-sm"
        >
          {t("auth.common.signIn")}
        </Link>
        <Link
          href="/register"
          className="w-full border-2 border-[#ff5100] text-[#ff5100] py-3 rounded-full font-bold hover:bg-orange-50 transition active:scale-[0.98] text-sm"
        >
          {t("auth.common.signUp")}
        </Link>
      </div>
    </div>
  );
}

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const t = useT();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        {t("support.loading")}
      </div>
    );
  }

  if (!user) return <LoginWall />;

  return <>{children}</>;
}
