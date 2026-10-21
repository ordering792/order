// src/components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Headphones, User } from "lucide-react";
import { useT } from "../../lib/i18n";

export default function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[500px] bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
      
      <NavItem icon={<Home size={22} />} label={t("nav.home")} href="/" active={pathname === "/"} />
      <NavItem icon={<ClipboardList size={22} />} label={t("nav.orders")} href="/orders" active={pathname === "/orders"} />

      {/* Center Floating Button with GIF */}
      <Link href="/grab" className="flex flex-col items-center relative -top-4 group">
        <div className="w-12 h-12 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center border-4 border-white shadow-md transition transform group-hover:scale-105 active:scale-95 overflow-hidden">
          {/* ခင်ဗျားရဲ့ Project ထဲက public ထဲမှာ gif ထည့်ထားပါ */}
          <img src="/images/11321466.gif" alt="Action" className="w-full h-full object-contain" />
        </div>
      </Link>

      <NavItem icon={<Headphones size={22} />} label={t("nav.support")} href="/support" active={pathname === "/support"} />
      <NavItem icon={<User size={22} />} label={t("nav.profile")} href="/profile" active={pathname === "/profile"} />

    </nav>
  );
}

function NavItem({ icon, label, href, active = false }: { icon: React.ReactNode, label: string, href: string, active?: boolean }) {
  return (
    <Link href={href} className={`flex flex-col items-center transition ${active ? "text-[#ff5a00]" : "text-gray-400 hover:text-[#ff5a00]"}`}>
      {icon}
      <span className={`text-[9px] mt-1 ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
    </Link>
  );
}