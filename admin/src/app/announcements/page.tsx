"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Search, User, Users, X } from "lucide-react";
import { api, type ApiAdminUser, type ApiAnnouncement } from "@/lib/api";
import { useT } from "@/lib/i18n";

const TILE_CAPTION =
  "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const FIELD_LABEL =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

type ComposeAudience = "all" | "one";
type ListAudience = "" | "all" | "personal";

const AUDIENCE_TILES = [
  { value: "all", labelKey: "admin.audience.all", icon: Users },
  { value: "one", labelKey: "admin.audience.one", icon: User },
] as const;

function recipientLine(user: ApiAdminUser) {
  return `${user.phone} · ${user.invitationCode}`;
}

export default function AdminAnnouncementsPage() {
  const t = useT();
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([]);
  const [listAudience, setListAudience] = useState<ListAudience>("");
  const [audience, setAudience] = useState<ComposeAudience>("all");
  const [recipient, setRecipient] = useState<ApiAdminUser | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [results, setResults] = useState<ApiAdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // setLoading(true) ကို effect ထဲ မခေါ်ဘူး — filter ပြောင်းတဲ့ onChange မှာပဲ ပေးတယ်။
  // (effect body ထဲ synchronous setState က cascading render ဖြစ်တယ်)။
  const load = useCallback(() => {
    api
      .adminListAnnouncements(listAudience || undefined)
      .then((res) =>
        setAnnouncements((res.announcements ?? []) as ApiAnnouncement[]),
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [listAudience]);

  useEffect(load, [load]);

  const searchRecipients = useCallback(() => {
    const term = recipientSearch.trim();

    if (audience !== "one" || !term) {
      setResults([]);
      return;
    }

    setSearching(true);
    api
      .adminListUsers({ search: term, limit: 5 })
      .then((res) => setResults(res.users))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [audience, recipientSearch]);

  useEffect(() => {
    const timer = setTimeout(searchRecipients, recipientSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [searchRecipients, recipientSearch]);

  const clearRecipient = () => {
    setRecipient(null);
    setRecipientSearch("");
    setResults([]);
  };

  const publish = async () => {
    setError("");
    setNotice("");

    try {
      await api.adminCreateAnnouncement({
        title,
        content,
        recipientId: audience === "one" ? recipient?._id ?? null : null,
      });
      setTitle("");
      setContent("");
      clearRecipient();
      setAudience("all");
      setNotice(t("admin.announceCreated"));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const needsRecipient = audience === "one" && !recipient;
  const canSend =
    Boolean(title.trim()) && Boolean(content.trim()) && !needsRecipient;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
          <Megaphone size={16} className="text-[#ff6600]" />
          {t("admin.create")}
        </h2>

        <div className="grid grid-cols-2 gap-2" role="group">
          {AUDIENCE_TILES.map((tile) => {
            const active = audience === tile.value;
            const Icon = tile.icon;

            return (
              <button
                key={tile.value}
                type="button"
                data-testid={`audience-tile-${tile.value}`}
                aria-pressed={active}
                onClick={() => {
                  setAudience(tile.value);
                  if (tile.value === "all") clearRecipient();
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? "border-[#ff6600] bg-orange-50/70"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <Icon
                  size={14}
                  className={active ? "text-[#ff6600]" : "text-slate-400"}
                />
                <span className={TILE_CAPTION}>{t(tile.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <label htmlFor="announcement-title" className={`mt-4 block ${FIELD_LABEL}`}>
          {t("admin.field.title")}
        </label>
        <input
          id="announcement-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
        />

        <label
          htmlFor="announcement-content"
          className={`mt-3 block ${FIELD_LABEL}`}
        >
          {t("admin.field.message")}
        </label>
        <textarea
          id="announcement-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
        />

        {audience === "one" && (
          <div className="mt-3">
            <span className={FIELD_LABEL} id="recipient-label">
              {t("admin.field.recipient")}
            </span>

            {recipient ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[#ff6600] bg-orange-50/70 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {recipient.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {recipientLine(recipient)}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid="recipient-clear"
                  onClick={clearRecipient}
                  aria-labelledby="recipient-label"
                  className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder={t("admin.search")}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>

                {searching && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {t("admin.loading")}
                  </p>
                )}

                {!searching && recipientSearch.trim() && results.length === 0 && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {t("admin.empty")}
                  </p>
                )}

                {results.length > 0 && (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {results.map((candidate) => (
                      <li key={candidate._id}>
                        <button
                          type="button"
                          data-testid={`recipient-result-${candidate._id}`}
                          onClick={() => {
                            setRecipient(candidate);
                            setRecipientSearch("");
                            setResults([]);
                          }}
                          className="w-full px-3 py-2 text-left transition hover:bg-slate-50"
                        >
                          <span className="block truncate text-xs font-semibold text-slate-800">
                            {candidate.name}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500">
                            {recipientLine(candidate)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

          </div>
        )}

        <button
          onClick={publish}
          disabled={!canSend}
          className="mt-4 w-full rounded-lg bg-[#ff6600] py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {t("admin.action.send")}
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
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <label
            htmlFor="audience-filter"
            className={`shrink-0 ${FIELD_LABEL}`}
          >
            {t("admin.audience.label")}
          </label>
          <select
            id="audience-filter"
            data-testid="audience-filter"
            value={listAudience}
            onChange={(e) => {
              setLoading(true);
              setListAudience(e.target.value as ListAudience);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
          >
            <option value="">—</option>
            <option value="all">{t("admin.audience.all")}</option>
            <option value="personal">{t("admin.audience.personal")}</option>
          </select>
        </div>

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
            {announcements.map((a) => {
              const isPersonal = Boolean(a.recipientId);

              return (
                <li key={a._id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      data-testid={
                        isPersonal ? "audience-chip-personal" : "audience-chip-all"
                      }
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isPersonal
                          ? "border border-orange-200 bg-orange-50 text-[#ff6600]"
                          : "bg-slate-100 text-slate-600"
                      }`}
                      title={a.recipientId?.phone}
                    >
                      {isPersonal ? a.recipientId?.name : t("admin.audience.all")}
                    </span>
                    {a.createdAt && (
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800">{a.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                    {a.content}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
