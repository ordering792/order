"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { getSocket } from "@/lib/socket";

interface AdminConversation {
  _id: string;
  subject?: string;
  status?: string;
  lastMessagePreview?: string;
  userId?: { name: string; phone: string } | null;
  ownerId?: { name: string; phone: string } | null;
}

interface AdminMessage {
  _id: string;
  body?: string;
  senderType?: string;
  createdAt?: string;
}

export default function AdminSupportPage() {
  const t = useT();
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [selected, setSelected] = useState<AdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    return api
      .adminListConversations()
      .then((res) => {
        const list = (res.conversations ?? []) as AdminConversation[];
        setConversations(list);

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
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await api.adminGetConversation(conversationId);
      setMessages((res.messages ?? []) as AdminMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (conversation: AdminConversation) => {
      setSelected(conversation);
      setError("");
      setMessages([]);
      await loadMessages(conversation._id);
    },
    [loadMessages],
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
      }
    };

    socket.on("conversation:new", refresh);
    socket.on("conversation:updated", onConversationUpdated);
    // Socket နောက်မှ ချိတ်ရင် လွတ်သွားတဲ့ event တွေကို ဖုံးအုပ်ဖို့။
    socket.on("connect", refresh);

    return () => {
      socket.off("conversation:new", refresh);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("connect", refresh);
    };
  }, [load, loadMessages, selected]);

  // Socket မရတဲ့အခါ (owner role / connection ပြတ်တာ) ကို ဖုံးအုပ်ဖို့
  // tab ပြန်လာတိုင်းနဲ့ ခပ်ကြားခပ်ကြား ပြန်စစ်မယ်။
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
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
  }, [load]);

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

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">
          {t("admin.nav.support")}
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
            {conversations.map((c) => (
              <li key={c._id}>
                <button
                  onClick={() => open(c)}
                  className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                    selected?._id === c._id ? "bg-orange-50" : ""
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {c.subject || c.userId?.name || "—"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {c.userId?.phone ?? ""} · {c.status ?? ""}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {c.lastMessagePreview ?? ""}
                  </p>
                </button>
              </li>
            ))}
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
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {selected.subject || selected.userId?.name}
                </p>
                <p className="text-xs text-slate-500">
                  {selected.userId?.phone ?? ""}
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                {t("admin.action.reject")}
              </button>
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
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder={t("admin.action.reply")}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#ff6600]"
              />
              <button
                onClick={send}
                disabled={!reply.trim()}
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
