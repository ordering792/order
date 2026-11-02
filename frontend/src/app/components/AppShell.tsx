"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { useAuth } from "../../lib/auth";

const CHROMELESS_PATHS = new Set([
  "/login",
  "/register",
  "/license",
  "/deposit",
  "/withdraw",
  "/wallet_bind",
  "/invite",
  "/security",
  "/orders",
  "/support",
  "/grab",
  "/deposit/history",
  "/profile",
  "/notifications",
]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const showChrome = !CHROMELESS_PATHS.has(pathname);

  // Agreement မထိုးရသေးသူကို ဘယ် page မှ မသုံးခိုင်းဘူး — login/register redirect
  // တစ်ခုတည်းနဲ့ URL တိုက်ရိုက်ရိုက်ဝင်တာ မတားနိုင်လို့။ ငွေရှာတဲ့ action တွေကိုတော့
  // backend က requireLicense နဲ့ သီးသန့် ထပ်တားတယ်။
  const needsLicense =
    !loading && !!user && !user.licenseAcceptedAt && pathname !== "/license";

  useEffect(() => {
    if (needsLicense) router.replace("/license");
  }, [needsLicense, router]);

  // Chrome (Header/BottomNav) ပေါ်တဲ့ လမ်းကြောင်းက login လိုတဲ့ home တစ်ခုတည်း။
  // auth မသိရသေးခင် render လိုက်ရင် redirect မတိုင်မီ ခေါင်းစဉ်ဘား အလွတ် တစ်ချက်မြင်ရတယ်။
  if (needsLicense || (showChrome && loading)) return null;

  return (
    <div dir="ltr" className="relative w-full min-h-screen flex flex-col overflow-hidden max-w-[500px] bg-white shadow-2xl">
      {showChrome && <Header />}
      <div
        className={`flex-1 overflow-y-auto w-full relative custom-scrollbar ${showChrome ? "pt-[60px] pb-20" : "pt-0 pb-0"}`}
      >
        {children}
      </div>
      {showChrome && <BottomNav />}
    </div>
  );
}
