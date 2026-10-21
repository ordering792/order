// src/app/layout.tsx
"use client"; // ★ usePathname သုံးဖို့ ဒါကို ထည့်ရပါမယ်

import "./globals.css";
import { usePathname } from "next/navigation"; // ★ Pathname စစ်ဖို့ ခေါ်ပါ
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import { AuthProvider } from "../lib/auth";
import { LanguageProvider } from "../lib/i18n";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/license" || pathname === "/deposit" || pathname === "/withdraw" || pathname === "/wallet_bind" || pathname === "/invite" || pathname === "/security" || pathname === "/orders" || pathname === "/support" || pathname === "/deposit/history" || pathname === "/profile" ;

  // Admin / Owner panel က သီးသန့် full-width layout နဲ့ ပြမယ်။
  // Tree ပုံစံ မပြောင်းပါ — class နဲ့ပဲ ပြောင်းထားတယ် (client-side navigation မပျက်စေဖို့)။
  const isAdminPanel = pathname.startsWith("/admin");
  const showChrome = !isAuthPage && !isAdminPanel;

  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.3.2/css/flag-icons.min.css"
        />
      </head>
      <body
        className={
          isAdminPanel
            ? "min-h-screen bg-slate-100"
            : "bg-[#f2f3f6] min-h-screen flex justify-center"
        }
      >
        <LanguageProvider>
        <AuthProvider>
          <div
            className={`relative w-full min-h-screen flex flex-col overflow-hidden ${
              isAdminPanel ? "bg-slate-100" : "max-w-[500px] bg-white shadow-2xl"
            }`}
          >

            {/* ★ Login/Register မဟုတ်မှ Header ကို ပြမယ် */}
            {showChrome && <Header />}

            {/* Main Content */}
            <div className={`flex-1 overflow-y-auto w-full relative custom-scrollbar ${showChrome ? 'pt-[60px] pb-20' : 'pt-0 pb-0'}`}>
              {children}
            </div>

            {/* ★ Login/Register မဟုတ်မှ BottomNav ကို ပြမယ် */}
            {showChrome && <BottomNav />}

          </div>
        </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}