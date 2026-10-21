"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface BulkImportPanelProps {
  onImported: () => void;
}

interface BulkProductInput {
  name: string;
  code?: string;
  category?: string;
  usage?: string;
  description?: string;
  imageUrl?: string;
  price: string;
}

// Product အများအပြားကို JSON array အဖြစ် paste လုပ်ပြီး တစ်ခါတည်း ထည့်မယ်။
export default function BulkImportPanel({ onImported }: BulkImportPanelProps) {
  const t = useT();
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    setError("");
    setNotice("");

    let rows: BulkProductInput[];

    try {
      rows = JSON.parse(bulkText);
      if (!Array.isArray(rows)) throw new Error("JSON array required");
    } catch {
      setError("Invalid JSON");
      return;
    }

    setIsImporting(true);

    try {
      const res = await api.adminBulkCreateProducts(rows);
      setNotice(t("admin.bulkResult", { count: res.count }));
      setBulkText("");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">
          {t("admin.action.bulkImport")}
        </h2>
        <button
          onClick={onImported}
          className="rounded p-1 text-slate-400 hover:text-slate-600"
        >
          <X size={16} />
        </button>
      </div>

      <textarea
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
        rows={8}
        placeholder='[{"name":"Item A","code":"P0001","category":"Electronics","usage":"Charge first","price":"50.00"}]'
        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-[#ff6600]"
      />

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">
          {notice}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleImport}
          disabled={isImporting || !bulkText.trim()}
          className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {isImporting ? t("admin.loading") : t("admin.action.bulkImport")}
        </button>
      </div>
    </div>
  );
}
