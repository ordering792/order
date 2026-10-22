"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  ArrowLeftRight,
  ClipboardList,
  Headphones,
  Megaphone,
  Crown,
  LogOut,
  Globe,
  ShieldCheck,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LanguageProvider, useT } from "@/lib/i18n";
import { getStoredLang } from "@/lib/language";
import CountryLanguageModal from "./components/CountryLanguageModal";
import "./globals.css";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "admin.nav.dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/users", labelKey: "admin.nav.users", icon: <Users size={18} /> },
  { href: "/products", labelKey: "admin.nav.products", icon: <Package size={18} /> },
  {
    href: "/transactions",
    labelKey: "admin.nav.transactions",
    icon: <ArrowLeftRight size={18} />,
  },
  { href: "/plans", labelKey: "admin.nav.plans", icon: <ClipboardList size={18} /> },
  { href: "/support", labelKey: "admin.nav.support", icon: <Headphones size={18} /> },
  {
    href: "/wallet",
    labelKey: "admin.nav.wallet",
    icon: <Wallet size={18} />,
  },
  {
    href: "/announcements",
    labelKey: "admin.nav.announcements",
    icon: <Megaphone size={18} />,
    adminOnly: true,
  },
  {
    href: "/owners",
    labelKey: "admin.nav.owners",
    icon: <Crown size={18} />,
    adminOnly: true,
  },
];

// ဒီ admin shell က standalone app ရဲ့ root layout ထဲမှာ providers နဲ့ ထဲ့ခံနေတယ်။
function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const selectedLanguage = getStoredLang();

  const isAdmin = user?.role === "admin";
  const hasAccess = user?.role === "admin" || user?.role === "owner";
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (loading || isLoginPage) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!hasAccess) {
      router.replace("/login");
    }
  }, [loading, user, hasAccess, isLoginPage, router]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Login page ကို admin shell မပါဘဲ တိုက်ရိုက်ပြမယ်။
  if (isLoginPage) {
    return <>{children}</>;
  }

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const isAuthorized = !loading && !!user && hasAccess;

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-100 text-slate-800">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-slate-900 text-slate-200 transition-transform lg:static lg:translate-x-0 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <ShieldCheck size={22} className="text-[#ff6600]" />
          <span className="text-sm font-bold tracking-wide text-white">
            {t("admin.title")}
          </span>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="ml-auto rounded p-1 text-slate-400 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[#ff6600] text-white shadow"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.icon}
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-slate-800 p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-xs font-bold text-white">
              {user?.name ?? ""}
            </p>
            <p className="text-[11px] text-slate-400">
              {user?.role === "admin"
                ? t("admin.role.admin")
                : t("admin.role.owner")}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut size={18} />
            {t("admin.logout")}
          </button>
        </div>
      </aside>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button
            onClick={() => setIsMenuOpen(true)}
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} />
          </button>

          <h1 className="text-base font-bold text-slate-800">
            {t(
              items.find((item) =>
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href),
              )?.labelKey ?? "admin.title",
            )}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIsLangOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              title={selectedLanguage.name}
            >
              <Globe size={18} />
            </button>
          </div>
        </header>

        <main className="relative flex-1 p-4 lg:p-6">
          {children}

          {/* ခွင့်ပြုချက် မရသေးခင် content ကို ဖုံးထားမယ် (API က authorization ကို ဆက်လက် စစ်တယ်) */}
          {!isAuthorized && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/90 backdrop-blur-[1px]">
              <p className="text-sm font-semibold text-slate-500">
                {loading ? t("admin.loading") : t("admin.login.denied")}
              </p>
            </div>
          )}
        </main>
      </div>

      <CountryLanguageModal
        isOpen={isLangOpen}
        onClose={() => setIsLangOpen(false)}
      />
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.3.2/css/flag-icons.min.css"
        />
      </head>
      <body className="min-h-screen bg-slate-100">
        <LanguageProvider>
          <AuthProvider>
            <AdminShell>{children}</AdminShell>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
