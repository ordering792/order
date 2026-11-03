"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Bell,
  Megaphone,
  ClipboardList,
  ArrowDownLeft,
  ArrowUpRight,
  Home,
  Headphones,
  User,
} from "lucide-react";
import { api, ApiTransaction } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { formatMoney } from "../../lib/money";

interface Announcement {
  _id: string;
  title: string;
  content: string;
  createdAt: string;
  userId?: { name: string } | null;
}

type NotificationKind = "announcement" | "deposit" | "withdraw";

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  announcement: Megaphone,
  deposit: ArrowDownLeft,
  withdraw: ArrowUpRight,
};

const KIND_STYLE: Record<NotificationKind, string> = {
  announcement: "bg-purple-50 text-purple-600",
  deposit: "bg-emerald-50 text-emerald-600",
  withdraw: "bg-sky-50 text-sky-600",
};

// Notifications က သတိပေးချက် သီးသန့် — စာရင်းအမှန်က /deposit/history ထဲ။
// Transaction တစ်ခု = card တစ်စောင် (status ပြောင်းရင် စာသားပဲ ပြောင်း)၊
// အထပ်မပုံအောင် နောက်ဆုံး ၂၀ ပဲ ပြတယ်။
const FEED_LIMIT = 20;

export default function NotificationsPage() {
  const t = useT();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);

    Promise.all([
      api
        .get<{ announcements: Announcement[] }>("/announcements")
        .then((res) => res.announcements)
        .catch(() => []),
      api
        .myTransactions()
        .then((res) => res.transactions)
        .catch(() => []),
    ])
      .then(([announcementList, transactionList]) => {
        setAnnouncements(announcementList);
        setTransactions(transactionList);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const items = useMemo<NotificationItem[]>(() => {
    const fromAnnouncements: NotificationItem[] = announcements.map((item) => ({
      id: item._id,
      kind: "announcement",
      title: item.title,
      body: item.content,
      time: item.createdAt,
    }));

    const amount = (value: ApiTransaction["amount"]) =>
      `$${formatMoney(value)}`;

    const fromTransactions: NotificationItem[] = transactions.map((tx) => {
      const isDeposit = tx.type === "deposit";
      const titleKey = isDeposit
        ? tx.status === "accepted"
          ? "notifications.depositAccepted"
          : tx.status === "rejected"
            ? "notifications.depositRejected"
            : "notifications.depositPending"
        : tx.status === "accepted"
          ? "notifications.withdrawAccepted"
          : tx.status === "rejected"
            ? "notifications.withdrawRejected"
            : "notifications.withdrawPending";

      const bodyKey =
        tx.status === "pending"
          ? "notifications.amountPending"
          : isDeposit
            ? tx.status === "accepted"
              ? "notifications.amountCredited"
              : "notifications.amountNotCredited"
            : tx.status === "accepted"
              ? "notifications.amountSent"
              : "notifications.amountReturned";

      return {
        id: `tx-${tx._id}`,
        kind: isDeposit ? "deposit" : "withdraw",
        title: t(titleKey),
        body: t(bodyKey, { amount: amount(tx.amount) }),
        time: (tx.reviewedAt ?? tx.createdAt) || tx.createdAt,
      };
    });

    return [...fromAnnouncements, ...fromTransactions]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, FEED_LIMIT);
  }, [announcements, transactions, t]);

  const timeLabel = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return t("notifications.justNow");
    if (minutes < 60) return t("notifications.minutesAgo", { count: minutes });

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("notifications.hoursAgo", { count: hours });

    return t("notifications.daysAgo", { count: Math.floor(hours / 24) });
  };

  return (
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-gray-50 shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className="bg-[#ff6600] text-white px-4 py-3.5 flex items-center justify-between shadow-sm z-30 shrink-0">
          <Link href="/" className="text-white flex items-center justify-center">
            <ChevronLeft size={30} />
          </Link>
          <span className="font-bold text-lg tracking-wider">
            {t("notifications.title")}
          </span>
          <div className="w-8"></div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-3 pb-24">
          {loading ? (
            <p className="text-center text-gray-400 py-10 text-sm">
              {t("notifications.loading")}
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <Bell size={46} className="mb-3" />
              <p className="text-sm">{t("notifications.empty")}</p>
            </div>
          ) : (
            items.map((item) => {
              const Icon = KIND_ICON[item.kind];

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex gap-3"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${KIND_STYLE[item.kind]}`}
                  >
                    <Icon size={20} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {item.title}
                    </p>

                    {item.body && (
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-3 leading-relaxed">
                        {item.body}
                      </p>
                    )}

                    <p className="text-[10px] text-gray-400 mt-1">
                      {timeLabel(item.time)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.home")}</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.orders")}</span>
          </Link>
          <Link href="/grab" className="flex flex-col items-center relative -top-4 group">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center border-4 border-white shadow-md text-white transition transform group-hover:scale-105 active:scale-95 overflow-hidden">
              <img src="/images/11321466.gif" alt="Icon" className="w-full h-full object-contain" />
            </div>
          </Link>
          <Link href="/support" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Headphones size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.support")}</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <User size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.profile")}</span>
          </Link>
        </nav>

      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
  );
}
