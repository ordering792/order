// src/app/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Wallet, CreditCard, Gift } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { money, moneyNumber } from "../lib/money";
import { useT } from "../lib/i18n";

const bannerImages = [
  "/images/image1.webp",
  "/images/image2.jpg",
  "/images/image3.webp",
  "/images/image4.avif",
  "/images/image5.jpg",
];

const partners = [
  { name: "Rakuten", color: "text-gray-400" },
  { name: "Amazon", color: "text-indigo-600" },
  { name: "PayPal", color: "text-blue-600" },
  { name: "Netflix", color: "text-red-500" },
  { name: "Binance", color: "text-amber-500" },
  { name: "Shopee", color: "text-emerald-600" },
];

// Ticker အတွက် display-only data — ပုံ (avatar) မသုံးဘူး၊ "User" badge ပဲ ပြတယ်။
// နံပါတ်/ဈေးနှုန်းတွေကို client ကိုယ်တိုင် ရေးသားပြီး (2026-11-05)။
const fakeCommissions = [
  { phone: "+1 415***737", name: "User", amount: "244.50" },
  { phone: "+44 207***295", name: "User", amount: "526.00" },
  { phone: "+65 6123***30", name: "User", amount: "162.50" },
  { phone: "+81 355***908", name: "User", amount: "340.00" },
  { phone: "+61 298***966", name: "User", amount: "794.20" },
  { phone: "+33 142***540", name: "User", amount: "179.30" },
  { phone: "+49 302***921", name: "User", amount: "256.00" },
  { phone: "+82 255***527", name: "User", amount: "419.00" },
  { phone: "+1 212***686", name: "User", amount: "101.50" },
  { phone: "+61 390***259", name: "User", amount: "289.00" },
  { phone: "+44 161***338", name: "User", amount: "625.00" },
  { phone: "+81 662***303", name: "User", amount: "380.50" },
  { phone: "+65 678***521", name: "User", amount: "143.00" },
  { phone: "+33 472***925", name: "User", amount: "421.40" },
  { phone: "+49 892***198", name: "User", amount: "153.20" },
  { phone: "+1 312***811", name: "User", amount: "301.60" },
  { phone: "+44 113***141", name: "User", amount: "255.10" },
  { phone: "+81 453***512", name: "User", amount: "835.40" },
  { phone: "+65 632***710", name: "User", amount: "198.30" },
  { phone: "+61 732***442", name: "User", amount: "479.70" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const t = useT();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [profits, setProfits] = useState({
    total: "0.00",
    today: "0.00",
    yesterday: "0.00",
    team: "0.00",
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user) {
      api
        .profits()
        .then((res) => {
          setProfits({
            total: money(res.profits.total),
            today: money(res.profits.today),
            yesterday: money(res.profits.yesterday),
            team: money(res.profits.team),
          });
        })
        .catch(() => {});
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user) {
      const timer = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % bannerImages.length);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [loading, user]);

  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnread = useCallback(() => {
    api
      .notificationUnreadCount()
      .then((res) => setUnreadCount(res.count))
      .catch(() => {});
  }, []);

  // Badge က pull-based — home ပြန်ရောက်တိုင်း (remount) နဲ့ ဖုန်း/app ပြန်ဖွင့်တိုင်း
  // မေးတယ်။ Socket fan-out ပြဿနာ ကာလုံ့ notification အတွက် push မသုံးသေးဘူး။
  useEffect(() => {
    if (loading || !user) return;

    loadUnread();

    const refresh = () => {
      if (document.visibilityState === "visible") loadUnread();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loading, user, loadUnread]);

  if (loading || !user) {
    return null;
  }

  const balance = moneyNumber(user?.balance);

  return (
    <div className="w-full bg-white pb-6">
      {/* Banner Carousel */}
      <div className="relative w-full h-52 bg-black overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out h-full"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {bannerImages.map((img, index) => (
            <div key={index} className="min-w-full h-full relative">
              <img
                src={img}
                alt={`Slide ${index}`}
                loading={index === 0 ? "eager" : "lazy"}
                className="w-full h-full object-fill"
              />
            </div>
          ))}
        </div>

        <div className="absolute bottom-3 left-0 right-0 flex justify-center space-x-1.5 z-10">
          {bannerImages.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === currentSlide ? "w-6 bg-white" : "w-2 bg-white/50"
              }`}
            ></span>
          ))}
        </div>
      </div>

      {/* Account Balance Card */}
      <div className="px-4 -mt-6 relative z-10">
        {user ? (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-orange-100 flex flex-col space-y-1">
            <h2 className="text-xl font-bold text-gray-800">{user.name}</h2>
            <div className="text-3xl font-semibold text-rose-500 flex items-center">
              <span className="mr-1">$</span>{" "}
              {balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs font-semibold text-gray-400">
              {t("home.accountBalance")}
            </span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-orange-100 flex flex-col space-y-3">
            <div className="flex items-center space-x-2 text-gray-500">
              <Wallet size={18} className="text-[#ff6600]" />
              <span className="text-sm font-semibold">
                {t("auth.guest.balanceNotice")}
              </span>
            </div>
            <Link
              href="/login"
              className="block w-full text-center bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-2.5 rounded-xl font-bold shadow-md hover:opacity-95 transition text-sm"
            >
              {t("auth.common.signIn")}
            </Link>
          </div>
        )}
      </div>

      {/* Start Earning Button */}
      <div className="px-4 mt-4">
        <Link
          href="/grab"
          className="block w-full text-center bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98]"
        >
          {t("home.startEarning")}
        </Link>
      </div>

      {/* Quick Action Navigation Buttons */}
      <div className="grid grid-cols-4 gap-2 px-4 py-6 text-center">
        <QuickAction
          icon={<Bell size={26} />}
          label={t("home.notifications")}
          href="/notifications"
          badge={unreadCount}
        />
        <QuickAction
          icon={<Wallet size={26} />}
          label={t("home.deposit")}
          href="/deposit"
        />
        <QuickAction
          icon={<CreditCard size={26} />}
          label={t("home.withdraw")}
          href="/withdraw"
        />
        <QuickAction
          icon={<Gift size={26} />}
          label={t("home.inviteFriends")}
          href="/invite"
        />
      </div>

      {/* Total Profits Section */}
      {user ? (
        <>
          <div className="px-4 pt-4 pb-1 flex items-center space-x-2">
            <div className="flex space-x-1">
              <div className="w-1.5 h-5 bg-amber-500 rounded-full"></div>
              <div className="w-1.5 h-5 bg-amber-400 rounded-full"></div>
            </div>
            <h2 className="text-base font-bold text-gray-800">
              {t("home.totalProfits")}
            </h2>
          </div>

          <div className="px-4 py-2 grid grid-cols-2 gap-3">
            <ProfitCard
              title={t("home.todaysProfit")}
              amount={money(profits.today)}
            />
            <ProfitCard
              title={t("home.yesterdaysProfit")}
              amount={money(profits.yesterday)}
            />
            <ProfitCard
              title={t("home.totalProfits")}
              amount={money(profits.total)}
            />
            <ProfitCard
              title={t("home.teamCommission")}
              amount={money(profits.team)}
            />
          </div>
        </>
      ) : (
        <div className="px-4 py-2">
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#ff6600] flex items-center justify-center shadow-inner">
              <CreditCard size={24} />
            </div>
            <span className="text-sm font-semibold text-gray-600">
              {t("auth.guest.profitNotice")}
            </span>
            <Link
              href="/login"
              className="px-8 bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-2.5 rounded-full font-bold shadow-md hover:opacity-95 transition text-sm"
            >
              {t("auth.common.signIn")}
            </Link>
          </div>
        </div>
      )}

      {/* --- User Commission Income Dynamics Section --- */}
      <div className="px-4 py-2">
        <h2 className="text-base font-bold text-gray-800 mb-3">
          {t("home.commissionDynamics")}
        </h2>

        {/* Ticker Box Wrapper — ၃ ကာ 3 steps (68px + 10px gap) အတိအကျမြင်အောင် 234px */}
        <div className="h-[234px] overflow-hidden relative">
          <div className="animate-vertical-scroll flex flex-col gap-2.5">
            {/* List ကို ၂ ကြိမ် ပတ်ပြီး Auto Seamless Infinite Loop ပြုလုပ်ရန် */}
            {[...fakeCommissions, ...fakeCommissions].map((item, i) => (
              <div
                key={i}
                className="h-[68px] bg-white border border-gray-100 rounded-xl px-3.5 flex items-center justify-between shadow-sm shrink-0"
              >
                <div className="flex items-center space-x-3">
                  <div className="px-2.5 h-9 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-400 text-white font-bold flex items-center justify-center text-xs tracking-wide shadow-sm shrink-0">
                    {item.name}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800">
                      {item.phone}
                    </span>
                    <span className="text-xs text-gray-400">
                      {t("orders.commission")}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-gray-400 block">
                    USDT
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {item.amount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vertical Scroll Animation CSS (Client က နှေးစေချင်တာမို့ 12s → 25s; hover pause မသုံးဘူး) */}
        <style jsx>{`
          @keyframes vertical-scroll {
            0% {
              transform: translateY(0);
            }
            100% {
              transform: translateY(-50%);
            }
          }
          .animate-vertical-scroll {
            animation: vertical-scroll 25s linear infinite;
          }
        `}</style>
      </div>
      {/* ----------------------------------------------------------------------- */}

      {/* Cooperative Partners */}
      <div className="px-4 py-3">
        <div className="bg-white border border-orange-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div>
            <h3 className="text-sm font-bold text-gray-800">
              {t("home.cooperativePartners")}
            </h3>
          </div>

          <div className="overflow-hidden relative w-full group">
            <div className="animate-marquee flex items-center space-x-8">
              {partners.map((p, i) => (
                <span
                  key={`first-${i}`}
                  className={`font-black tracking-wider text-lg uppercase ${p.color}`}
                >
                  {p.name}
                </span>
              ))}
              {partners.map((p, i) => (
                <span
                  key={`second-${i}`}
                  className={`font-black tracking-wider text-lg uppercase ${p.color}`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          <style jsx>{`
            @keyframes marquee {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-50%);
              }
            }
            .animate-marquee {
              width: max-content;
              animation: marquee 15s linear infinite;
            }
            .group:hover .animate-marquee {
              animation-play-state: paused;
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  href,
  badge = 0,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
}) {
  const t = useT();

  return (
    <Link
      href={href}
      className="flex flex-col items-center cursor-pointer group"
    >
      <div className="relative w-14 h-14 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full flex items-center justify-center text-white shadow-md border-2 border-amber-200 group-hover:scale-105 transition">
        {icon}
        {badge > 0 && (
          <span
            data-testid="notification-badge"
            aria-label={t("home.unreadCount", { count: badge })}
            className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 grid place-items-center rounded-full bg-red-500 border-2 border-white text-[10px] font-bold leading-none text-white"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span className="font-medium text-gray-700 mt-2 text-xs">{label}</span>
    </Link>
  );
}

function ProfitCard({ title, amount }: { title: string; amount: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl shadow-sm flex flex-col justify-center items-center text-center">
      <span className="text-xl font-black text-rose-500 flex items-center mb-1">
        <span className="text-sm mr-0.5">$</span>
        {amount}
      </span>
      <span className="text-xs font-semibold text-gray-500">{title}</span>
    </div>
  );
}
