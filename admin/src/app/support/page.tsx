"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { getSocket } from "@/lib/socket";

interface AdminConversation {
  _id: string;
  subject?: string;
  status?: string;
  lastMessagePreview?: string;
  guestId?: string | null;
  userId?: { name: string; phone: string } | null;
  ownerId?: { name: string; phone: string } | null;
  // Admin မဖတ်ရသေးတဲ့ customer စာ အရေအတွက် — backend က Message.readAt
  // ကို ကြည့်ပြီး တွက်ပေးတာ (badge + bold အတွက်)။
  unreadCountByAdmin?: number;
}

interface AdminMessage {
  _id: string;
  body?: string;
  senderType?: string;
  createdAt?: string;
}

// All / Users / Guests tab — "all" က backend default မို့ query မပို့ဘူး။
type ParticipantTab = "all" | "users" | "guests";

const TAB_KEYS: ParticipantTab[] = ["all", "users", "guests"];

const TAB_LABEL: Record<ParticipantTab, string> = {
  all: "admin.support.tabAll",
  users: "admin.support.tabUsers",
  guests: "admin.support.tabGuests",
};

interface TabCounts {
  all: number;
  users: number;
  guests: number;
}

// guestId က UUID ဖြစ်လို့ အုပ်စုပထမ (8) လုံးပဲ ပြတယ် — admin ဆီ trace လုပ်ဖို့
// လုံလောက်တဲ့ handle။ အတိုကောက်မပြဘဲ ပြည့်ပြလိုက်ရင် row အကျယ်ပွားမယ်။
const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id);

export default function AdminSupportPage() {
  const t = useT();
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [selected, setSelected] = useState<AdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [participant, setParticipant] = useState<ParticipantTab>("all");
  const [counts, setCounts] = useState<TabCounts | null>(null);

  const load = useCallback(
    (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      return api
        .adminListConversations({
          search: search.trim() || undefined,
          participant: participant === "all" ? undefined : participant,
        })
        .then((res) => {
          const list = (res.conversations ?? []) as AdminConversation[];
          setConversations(list);
          setCounts(res.counts ?? null);

          setSelected((current) => {
            if (!current) return current;
            const fresh = list.find((c) => c._id === current._id);
            return fresh ?? current;
          });
        })
        .catch((err) => {
          if (!silent) setError(err.message);
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [search, participant],
  );

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await api.adminGetConversation(conversationId);
      setMessages((res.messages ?? []) as AdminMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }, []);

  // ဖတ်ပြီး လက်မှတ်ရေးတာ — backend က customer စာတိုင်းရဲ့ readAt ကို stamp လုပ်လို့
  // poll က ဒီ conversation ကို unread 0 ပြန်ပေးမယ်။ Request မအောင်ရင် poll က
  // badge ကို ပြန်တင်ပေးမယ်, ဒါကြောင့် အောင်တဲ့အခါမှာပဲ ချက်ချင်း 0 ပြောင်းတယ်။
  const clearUnread = useCallback((conversationId: string) => {
    void api
      .adminMarkConversationRead(conversationId)
      .then(() => {
        setConversations((prev) =>
          prev.map((c) =>
            c._id === conversationId ? { ...c, unreadCountByAdmin: 0 } : c,
          ),
        );
        setSelected((current) =>
          current?._id === conversationId
            ? { ...current, unreadCountByAdmin: 0 }
            : current,
        );
      })
      .catch(() => {});
  }, []);

  // ဖျက်ပြီးသား conversation ကို list ရော ဖွင့်ထားတဲ့ panel ကပါ ချက်ချင်း ဖယ်တယ် —
  // မဟုတ်ရင် မရှိတော့တဲ့ id ကို ဆက်ခေါ်နေမိမယ်။ ကိုယ်တိုင် ဖျက်တာရော ကျန် admin tab
  // တစ်ခုက ဖျက်လို့ socket "conversation:deleted" ကျတာရော ဒီနေရာပဲ ဖြတ်တယ်။
  const dropConversation = useCallback(
    (conversationId: string) => {
      setConversations((prev) => prev.filter((c) => c._id !== conversationId));
      if (selected?._id === conversationId) {
        setSelected(null);
        setMessages([]);
      }
    },
    [selected],
  );

  // Search ရိုက်နေတိုင်း request မပို့ဘူး — 350ms နားထောင်ပြီးမှ ပို့တယ်။
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);

    return () => clearTimeout(timer);
  }, [load, search]);

  // Conversation ဖွင့်လျှင် ဖတ်ပြီး လက်မှတ်ရေးမယ် — poll အဖြေကို မစောင့်ဘူး,
  // ဒါမှ flash ပြန်မပေါ်။
  const open = useCallback(
    async (conversation: AdminConversation) => {
      setSelected(conversation);
      setError("");
      setMessages([]);
      await loadMessages(conversation._id);

      if (conversation.unreadCountByAdmin) clearUnread(conversation._id);
    },
    [loadMessages, clearUnread],
  );

  // User က စာပို့တာနဲ့ ချက်ချင်း ပြမယ် — conversation:new / conversation:updated
  // event တွေကို backend က "admins" room ထဲ ပို့ပြီးသား။
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => {
      void load(true);
    };

    const onConversationUpdated = (payload: { conversationId?: string }) => {
      refresh();
      // ဖွင့်ထားတဲ့ conversation အတွက်ပဲ message panel ကို ပြန်ဖတ်မယ် —
      // မဟုတ်ရင် အခြား conversation ရဲ့ စာတွေ ပြနေမယ်။
      if (payload?.conversationId && selected?._id === payload.conversationId) {
        void loadMessages(payload.conversationId);
        // စာပို့တဲ့အခါ backend က message:new နဲ့ ဒီ event နှစ်ခုလုံး ပို့တယ် —
        // ဒီမှာပဲ ဖတ်ပြီး လက်မှတ်ရေးတယ် (တစ်ကြိမ်တည်း)။ Admin က tab ကို
        // နောက်မှာထားရင် မရေးဘူး: badge ဆက်တိုးမယ်, "မဖြေရသေးတာ ရှိသေး"
        // ဆိုတဲ့ signal မပျောက်အောင်။
        if (document.visibilityState === "visible") {
          clearUnread(payload.conversationId);
        }
      }
    };

    const onConversationDeleted = (payload: { conversationId?: string }) => {
      if (payload?.conversationId) dropConversation(payload.conversationId);
      refresh();
    };

    socket.on("conversation:new", refresh);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("conversation:deleted", onConversationDeleted);
    // Socket နောက်မှ ချိတ်ရင် လွတ်သွားတဲ့ event တွေကို ဖုံးအုပ်ဖို့။
    socket.on("connect", refresh);

    return () => {
      socket.off("conversation:new", refresh);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("conversation:deleted", onConversationDeleted);
      socket.off("connect", refresh);
    };
  }, [clearUnread, dropConversation, load, loadMessages, selected]);

  // ဖွင့်ထားတဲ့ conversation ရဲ့ id — effect ကို object identity မဟုတ်ဘဲ
  // ဒီ string နဲ့ပဲ ပြန်ဆက်မယ် (15s poll က selected object အသစ်ကို ပြန်ထည့်လို့)။
  const selectedId = selected?._id ?? "";

  // Admin ကိုယ်တိုင် conv:<id> ထဲ ဝင်တယ် — backend က ဖတ်ခွင့်ရှိသူအတွက် room ကို
  // ခွင့်ပြုထားလို့ message:new ကို user ဘက်လိုပဲ တိုက်ရိုက်ရတယ်၊ conversation
  // ပြန်နှိပ်စရာ မလိုတော့ဘူး။
  useEffect(() => {
    if (!selectedId) return;

    const socket = getSocket();
    if (!socket) return;

    const join = () => {
      socket.emit("conversation:join", selectedId, () => {});
    };

    if (socket.connected) join();
    socket.on("connect", join);

    const onNewMessage = (payload: {
      conversationId?: string;
      message?: AdminMessage;
    }) => {
      const incoming = payload?.message;
      if (!incoming || payload.conversationId !== selectedId) return;

      // conversation:updated fallback ရဲ့ refetch နဲ့ ထပ်ကျရင် duplicate
      // မပေါ်အောင် id နဲ့ စစ်ထားတယ်။
      setMessages((prev) =>
        prev.some((m) => String(m._id) === String(incoming._id))
          ? prev
          : [...prev, incoming],
      );
    };

    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("connect", join);
      socket.off("message:new", onNewMessage);
      socket.emit("conversation:leave", selectedId);
    };
  }, [selectedId]);

  // Socket မရတဲ့အခါ (owner role / connection ပြတ်တာ) ကို ဖုံးအုပ်ဖို့
  // tab ပြန်လာတိုင်းနဲ့ ခပ်ကြားခပ်ကြား ပြန်စစ်မယ်။
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
      // Tab ပြန်လာချိန်မှာ ဖွင့်ထားတဲ့ panel က စာတွေ ဖတ်ပြီးသား — နောက်မှာထားချိန်
      // တိုးသွားတဲ့ badge ကို ဒီမှာ ပြန်ရှင်းမယ်။
      if (selectedId) clearUnread(selectedId);
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load(true);
    }, 15000);

    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [clearUnread, load, selectedId]);

  const send = async () => {
    if (!selected || !reply.trim()) return;

    setError("");
    try {
      await api.adminSendMessage(selected._id, reply.trim());
      setReply("");
      await loadMessages(selected._id);
      void load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const close = async () => {
    if (!selected) return;
    setError("");
    try {
      await api.adminCloseConversation(selected._id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const reopen = async () => {
    if (!selected) return;
    setError("");
    try {
      await api.adminReopenConversation(selected._id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(t("admin.deleteConfirm"))) return;

    setError("");
    try {
      const conversationId = selected._id;
      await api.adminDeleteConversation(conversationId);
      dropConversation(conversationId);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  // အကောင့်ဖောက်ပြီးသူ = အမည်အပြည့်; မဖောက်သူ = "Guest" + guestId။
  // Subject က conversation type ပဲ ဖြစ်လို့ identity အောက်မှာ ဒုတိယနေရာပေးတယ်။
  const identity = (c: AdminConversation) => {
    if (c.userId?.name) return c.userId.name;
    if (c.guestId) return `${t("admin.support.guest")} · ${shortId(c.guestId)}`;
    return "—";
  };

  const meta = (c: AdminConversation) =>
    [c.userId?.phone, c.subject, c.status].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">
          {t("admin.nav.support")}
        </div>

        <div
          className="flex gap-1 border-b border-slate-200 px-3 py-2"
          role="tablist"
          aria-label={t("admin.nav.support")}
        >
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={participant === key}
              data-testid={`support-tab-${key}`}
              onClick={() => setParticipant(key)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                participant === key
                  ? "bg-[#ff6600] text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t(TAB_LABEL[key])}
              {counts && (
                <span
                  className={
                    participant === key ? "text-white/80" : "text-slate-400"
                  }
                >
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            data-testid="support-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.support.searchPlaceholder")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {t("admin.loading")}
          </p>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {t("admin.empty")}
          </p>
        ) : (
          <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
            {conversations.map((c) => {
              const unread = c.unreadCountByAdmin ?? 0;

              return (
                <li key={c._id}>
                  <button
                    onClick={() => open(c)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                      selected?._id === c._id ? "bg-orange-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        data-testid={unread ? "unread-dot" : undefined}
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          unread ? "bg-red-500" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            unread
                              ? "font-bold text-slate-900"
                              : "font-medium text-slate-500"
                          }`}
                        >
                          {identity(c)}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {meta(c)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {c.lastMessagePreview ?? ""}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span
                          data-testid="unread-badge"
                          title={t("admin.support.unread", { count: unread })}
                          className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex min-h-[420px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        {!selected ? (
          <p className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("admin.empty")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div data-testid="support-header">
                <p className="text-sm font-bold text-slate-800">
                  {identity(selected)}
                </p>
                <p className="text-xs text-slate-500">{meta(selected)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  data-testid="support-delete"
                  onClick={remove}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50"
                >
                  {t("admin.delete")}
                </button>
                {selected.status === "closed" ? (
                  <button
                    data-testid="support-reopen"
                    onClick={reopen}
                    className="rounded-lg border border-[#ff6600] px-3 py-1.5 text-[11px] font-semibold text-[#ff6600] transition hover:bg-orange-50"
                  >
                    {t("admin.action.reopen")}
                  </button>
                ) : (
                  <button
                    data-testid="support-close"
                    onClick={close}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {t("admin.action.reject")}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400">
                  {t("admin.empty")}
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m._id}
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      m.senderType === "admin"
                        ? "ml-auto bg-[#ff6600] text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {m.body}
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-200 p-3">
              <input
                value={reply}
                data-testid="support-reply"
                disabled={selected.status === "closed"}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder={t("admin.action.reply")}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600] disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                onClick={send}
                disabled={selected.status === "closed" || !reply.trim()}
                className="rounded-lg bg-[#ff6600] px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {t("admin.action.send")}
              </button>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 lg:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}
