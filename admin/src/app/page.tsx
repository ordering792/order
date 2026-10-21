"use client";

import { useEffect, useState } from "react";
import { api, ApiAdminStats } from "@/lib/api";
import { useT } from "@/lib/i18n";

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "orange" | "emerald" | "amber";
}) {
  const tones: Record<string, string> = {
    slate: "bg-white border-slate-200",
    orange: "bg-orange-50 border-orange-200",
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useT();
  const [stats, setStats] = useState<ApiAdminStats | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    api
      .adminStats()
      .then((res) => setStats(res.stats))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {!stats ? (
        <p className="text-sm text-slate-500">{t("admin.loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t("admin.stats.users")} value={stats.totalUsers} />
            <StatCard label={t("admin.stats.owners")} value={stats.totalOwners} />
            <StatCard
              label={t("admin.stats.products")}
              value={stats.totalProducts}
              tone="orange"
            />
            <StatCard
              label={t("admin.stats.volume")}
              value={String(stats.acceptedVolume)}
              tone="emerald"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t("admin.stats.pendingDeposits")}
              value={stats.pendingDeposits}
              tone="amber"
            />
            <StatCard
              label={t("admin.stats.pendingWithdraws")}
              value={stats.pendingWithdraws}
              tone="amber"
            />
            <StatCard label={t("admin.stats.plans")} value={stats.totalPlans} />
            <StatCard
              label={t("admin.stats.generated")}
              value={stats.generatedPlans}
              tone="orange"
            />
          </div>
        </>
      )}

      <button
        onClick={load}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        {t("admin.refresh")}
      </button>
    </div>
  );
}
