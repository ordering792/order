"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { uploadToImageKit, validateImageFile } from "@/lib/uploadImage";

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
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");

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

        <div className="text-xs font-semibold text-slate-500 sm:col-span-2">
          {t("admin.field.image")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={imageUploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setImageError("");
              if (!file) return;

              try {
                validateImageFile(file, 5 * 1024 * 1024);
                setImageUploading(true);
                const url = await uploadToImageKit(file, "product");
                onChange({ ...values, imageUrl: url });
              } catch (err) {
                setImageError(
                  err instanceof Error ? err.message : "Image upload failed",
                );
              } finally {
                setImageUploading(false);
                e.target.value = "";
              }
            }}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#ff6600]"
          />
          {imageUploading && (
            <p className="mt-2 text-xs text-slate-500">Uploading image...</p>
          )}
          {imageError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
              {imageError}
            </p>
          )}
          {values.imageUrl && (
            <div className="mt-3 flex items-center gap-3">
              <img
                src={values.imageUrl}
                alt={values.name || "Product image"}
                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => onChange({ ...values, imageUrl: "" })}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Remove image
              </button>
            </div>
          )}
        </div>
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
