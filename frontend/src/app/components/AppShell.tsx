"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import BottomNav from "./BottomNav";

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
  const showChrome = !CHROMELESS_PATHS.has(pathname);

  return (
    <div className="relative w-full min-h-screen flex flex-col overflow-hidden max-w-[500px] bg-white shadow-2xl">
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
