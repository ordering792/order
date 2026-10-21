"use client";

import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface ProductFormValues {
  name: string;
  code: string;
  category: string;
  usage: string;
  description: string;
  imageUrl: string;
  price: string;
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  code: "",
  category: "",
  usage: "",
  description: "",
  imageUrl: "",
  price: "",
};

interface ProductFormProps {
  values: ProductFormValues;
  editing: boolean;
  onChange: (values: ProductFormValues) => void;
  onSave: () => void;
  onCancel: () => void;
}

// Admin / Owner က product ဖန်တီး/ပြင်တဲ့ form — ၆ မျိုးစလုံး (title, code, category, usage, price, image)။
export default function ProductForm({
  values,
  editing,
  onChange,
  onSave,
  onCancel,
}: ProductFormProps) {
  const t = useT();

  const field = (key: keyof ProductFormValues) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...values, [key]: e.target.value }),
  });

  return (
    <div
      data-testid="product-form"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">
          {editing ? t("admin.edit") : t("admin.create")}
        </h2>
        <button
          onClick={onCancel}
          className="rounded p-1 text-slate-400 hover:text-slate-600"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-500">
          {t("admin.field.title")}
          <input
            type="text"
            {...field("name")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="text-xs font-semibold text-slate-500">
          {t("admin.field.code")}
          <input
            type="text"
            {...field("code")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="text-xs font-semibold text-slate-500">
          {t("admin.field.category")}
          <input
            type="text"
            {...field("category")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="text-xs font-semibold text-slate-500">
          {t("admin.field.price")}
          <input
            type="text"
            {...field("price")}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
          {t("admin.field.usage")}
          <textarea
            {...field("usage")}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>

        <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
          {t("admin.field.image")}
          <input
            type="text"
            {...field("imageUrl")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#ff6600]"
          />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onSave}
          className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
        >
          {t("admin.save")}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          {t("admin.cancel")}
        </button>
      </div>
    </div>
  );
}
