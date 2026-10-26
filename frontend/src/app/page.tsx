// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell, Wallet, CreditCard, Gift, FileText, Globe, Users, Download
} from "lucide-react";
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

export default function DashboardPage() {
  const { user } = useAuth();
  const t = useT();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [profits, setProfits] = useState({
    total: "0.00",
    today: "0.00",
    yesterday: "0.00",
    team: "0.00",
  });

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerImages.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const balance = moneyNumber(user?.balance);

  return (
    <div className="w-full bg-white">

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

      <div className="px-4 -mt-6 relative z-10">
        {user ? (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-orange-100 flex flex-col space-y-1">
            <h2 className="text-xl font-bold text-gray-800">{user.name}</h2>
            <div className="text-3xl font-semibold text-rose-500 flex items-center">
              <span className="mr-1">$</span> {balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs font-semibold text-gray-400">{t("home.accountBalance")}</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-orange-100 flex flex-col space-y-3">
            <div className="flex items-center space-x-2 text-gray-500">
              <Wallet size={18} className="text-[#ff6600]" />
              <span className="text-sm font-semibold">{t("auth.guest.balanceNotice")}</span>
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

      <div className="px-4 mt-4">
        <Link href="/grab" className="block w-full text-center bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-3.5 rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:opacity-95 transition active:scale-[0.98]">
          {t("home.startEarning")}
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-2 px-4 py-6 text-center">
        <QuickAction icon={<Bell size={26} />} label={t("home.notifications")} href="/notifications" />
        <QuickAction icon={<Wallet size={26} />} label={t("home.deposit")} href="/deposit" />
        <QuickAction icon={<CreditCard size={26} />} label={t("home.withdraw")} href="/withdraw" />
        <QuickAction icon={<Gift size={26} />} label={t("home.inviteFriends")} href="/invite" />
      </div>

      {user ? (
        <>
          <div className="px-4 pt-2 pb-1 flex items-center space-x-2">
            <div className="flex space-x-1">
              <div className="w-1.5 h-5 bg-amber-500 rounded-full"></div>
              <div className="w-1.5 h-5 bg-amber-400 rounded-full"></div>
            </div>
            <h2 className="text-base font-bold text-gray-800">{t("home.totalProfits")}</h2>
          </div>

          <div className="px-4 py-2 grid grid-cols-2 gap-3">
            <ProfitCard title={t("home.todaysProfit")} amount={money(profits.today)} />
            <ProfitCard title={t("home.yesterdaysProfit")} amount={money(profits.yesterday)} />
            <ProfitCard title={t("home.totalProfits")} amount={money(profits.total)} />
            <ProfitCard title={t("home.teamCommission")} amount={money(profits.team)} />
          </div>
        </>
      ) : (
        <div className="px-4 py-2">
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-orange-50 text-[#ff6600] flex items-center justify-center shadow-inner">
              <CreditCard size={24} />
            </div>
            <span className="text-sm font-semibold text-gray-600">{t("auth.guest.profitNotice")}</span>
            <Link
              href="/login"
              className="px-8 bg-gradient-to-r from-[#ff782d] to-[#ff5100] text-white py-2.5 rounded-full font-bold shadow-md hover:opacity-95 transition text-sm"
            >
              {t("auth.common.signIn")}
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 px-4 py-4 text-center">
        <QuickAction icon={<FileText size={26} />} label={t("home.companyProfile")} href="#" small />
        <QuickAction icon={<Globe size={26} />} label={t("home.platformRules")} href="#" small />
        <QuickAction icon={<Users size={26} />} label={t("home.agentCooperation")} href="#" small />
        <QuickAction icon={<Download size={26} />} label={t("home.downloadApp")} href="#" small />
      </div>

      <div className="px-4 py-3">
        <div className="bg-white border border-orange-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div>
            <h3 className="text-sm font-bold text-gray-800">{t("home.cooperativePartners")}</h3>
          </div>

          <div className="overflow-hidden relative w-full group">
            <div className="animate-marquee flex items-center space-x-8">
              {partners.map((p, i) => (
                <span key={`first-${i}`} className={`font-black tracking-wider text-lg uppercase ${p.color}`}>
                  {p.name}
                </span>
              ))}
              {partners.map((p, i) => (
                <span key={`second-${i}`} className={`font-black tracking-wider text-lg uppercase ${p.color}`}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          <style jsx>{`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
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

function QuickAction({ icon, label, href, small = false }: { icon: React.ReactNode, label: string, href: string, small?: boolean }) {
  return (
    <Link href={href} className="flex flex-col items-center cursor-pointer group">
      <div className="w-14 h-14 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full flex items-center justify-center text-white shadow-md border-2 border-amber-200 group-hover:scale-105 transition">
        {icon}
      </div>
      <span className={`font-medium text-gray-700 mt-2 ${small ? 'text-[11px] leading-tight' : 'text-xs'}`}>
        {label}
      </span>
    </Link>
  );
}

function ProfitCard({ title, amount }: { title: string, amount: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl shadow-sm flex flex-col justify-center items-center text-center">
      <span className="text-xl font-black text-rose-500 flex items-center mb-1">
        <span className="text-sm mr-0.5">$</span>{amount}
      </span>
      <span className="text-xs font-semibold text-gray-500">{title}</span>
    </div>
  );
}
