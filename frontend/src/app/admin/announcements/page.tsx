"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";

interface Announcement {
  _id: string;
  title: string;
  content: string;
  createdAt?: string;
  userId?: { name: string } | null;
}

export default function AdminAnnouncementsPage() {
  const t = useT();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api
      .adminListAnnouncements()
      .then((res) => setAnnouncements((res.announcements ?? []) as Announcement[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const publish = async () => {
    setError("");
    setNotice("");

    try {
      await api.adminCreateAnnouncement({ title, content });
      setTitle("");
      setContent("");
      setNotice(t("admin.announceCreated"));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
          <Megaphone size={16} className="text-[#ff6600]" />
          {t("admin.create")}
        </h2>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("admin.field.title")}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder={t("admin.field.usage")}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
        />

        <button
          onClick={publish}
          disabled={!title.trim() || !content.trim()}
          className="mt-3 w-full rounded-lg bg-[#ff6600] py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {t("admin.save")}
        </button>

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
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {t("admin.loading")}
          </p>
        ) : announcements.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {t("admin.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {announcements.map((a) => (
              <li key={a._id} className="px-4 py-3">
                <p className="text-sm font-bold text-slate-800">{a.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                  {a.content}
                </p>
                {a.createdAt && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
