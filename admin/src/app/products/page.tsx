"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Upload, X, Pencil } from "lucide-react";
import { api, ApiProduct } from "@/lib/api";
import { money } from "@/lib/money";
import { useT } from "@/lib/i18n";
import ProductForm, {
  EMPTY_PRODUCT,
  type ProductFormValues,
} from "../components/ProductForm";
import BulkImportPanel from "../components/BulkImportPanel";

const PAGE_SIZE = 50;

function toForm(product: ApiProduct): ProductFormValues {
  return {
    name: product.name ?? "",
    code: product.code ?? "",
    category: product.category ?? "",
    usage: product.usage ?? "",
    description: product.description ?? "",
    imageUrl: product.imageUrl ?? "",
    price: money(product.price),
  };
}

export default function AdminProductsPage() {
  const t = useT();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormValues>(EMPTY_PRODUCT);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ products: ApiProduct[] }>("/products")
      .then((res) => setProducts(res.products))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const visible = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_PRODUCT);
    setIsFormOpen(true);
  };

  const openEdit = (product: ApiProduct) => {
    setEditingId(product._id);
    setForm(toForm(product));
    setIsFormOpen(true);
  };

  const save = async () => {
    setError("");
    setNotice("");

    try {
      if (editingId) {
        await api.adminUpdateProduct(editingId, {
          name: form.name,
          code: form.code,
          category: form.category,
          usage: form.usage,
          description: form.description,
          imageUrl: form.imageUrl || null,
          price: form.price,
        });
      } else {
        await api.adminCreateProduct({
          name: form.name,
          code: form.code,
          category: form.category,
          usage: form.usage,
          description: form.description,
          imageUrl: form.imageUrl || null,
          price: form.price,
        });
      }

      setIsFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (product: ApiProduct) => {
    if (!window.confirm(t("admin.deleteConfirm"))) return;

    setError("");
    try {
      await api.adminDeleteProduct(product._id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.search")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[#ff6600] px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
        >
          <Plus size={16} />
          {t("admin.create")}
        </button>

        <button
          onClick={() => setIsBulkOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <Upload size={16} />
          {t("admin.action.bulkImport")}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">
          {notice}
        </p>
      )}

      {isFormOpen && (
        <ProductForm
          values={form}
          editing={Boolean(editingId)}
          onChange={setForm}
          onSave={save}
          onCancel={() => setIsFormOpen(false)}
        />
      )}

      {isBulkOpen && (
        <BulkImportPanel
          onImported={() => {
            load();
            setIsBulkOpen(false);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.field.image")}</th>
              <th className="px-4 py-3">{t("admin.field.title")}</th>
              <th className="px-4 py-3">{t("admin.field.code")}</th>
              <th className="px-4 py-3">{t("admin.field.category")}</th>
              <th className="px-4 py-3">{t("admin.field.price")}</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("admin.empty")}
                </td>
              </tr>
            ) : (
              paged.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        loading="lazy"
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {p.code || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.category || "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#ff6600]">
                    ${money(p.price)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-50"
                        title={t("admin.edit")}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => remove(p)}
                        className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 transition hover:bg-red-100"
                        title={t("admin.delete")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {visible.length} / {products.length}
        </span>

        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.back")}
            </button>
            <span>
              {currentPage} / {pageCount}
            </span>
            <button
              disabled={currentPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              {t("admin.refresh")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
