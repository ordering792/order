"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Headphones } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { getSocket } from "../../lib/socket";
import { ensureGuestId } from "../../lib/guestId";
import { useToast } from "../../lib/useToast";
import Toast from "./Toast";

interface ChatMessage {
  _id: string;
  senderType: "customer" | "admin";
  body: string;
  createdAt: string;
}

interface CustomerServiceChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerServiceChat({
  isOpen,
  onClose,
}: CustomerServiceChatProps) {
  const t = useT();
  const { toast, showToast } = useToast(2000);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // api layer က token မရှိရင် guestId ကို body/query ထဲ အလိုအလျောက် ထည့်ပေးတယ်။
  // conversationId ကို localStorage မှာ မသိမ်းဘူး — admin ပိတ်လိုက်တဲ့ conversation ကြောင့်
  // 404 ထဲမှာ အပြီးအပိုင် ပိတ်မိတဲ့ လမ်းကို ပိတ်ထားတာ။
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    api
      .myConversations()
      .then((res) => {
        if (res.conversations.length > 0) {
          const conv = res.conversations[0] as { _id: string };
          setConversationId(conv._id);
          return api.getConversation(conv._id);
        }
        return api
          .startConversation({ subject: t("support.subject") })
          .then((created) => {
            const conv = created.conversation as { _id: string };
            setConversationId(conv._id);
            return api.getConversation(conv._id);
          });
      })
      .then((data) => {
        setMessages(
          (data.messages as ChatMessage[]).map((m) => ({
            _id: m._id,
            senderType: m.senderType,
            body: m.body,
            createdAt: m.createdAt,
          })),
        );
      })
      .catch(() => showToast(t("support.loadFailed")))
      .finally(() => setLoading(false));
  }, [isOpen, t, showToast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;

    // Token ရှိရင် ensureGuestId က null ပြန်ပေးလို့ guest handshake မဖြစ်ဘူး။
    const socket = getSocket(ensureGuestId() ?? undefined);
    if (!socket) return;

    const join = () => {
      socket.emit("conversation:join", conversationId, () => {});
    };

    if (socket.connected) join();
    socket.on("connect", join);

    const onNewMessage = (payload: {
      conversationId?: string;
      message?: ChatMessage;
    }) => {
      const incoming = payload?.message;
      if (!incoming || payload.conversationId !== conversationId) return;

      setMessages((prev) => {
        if (prev.some((m) => m._id === incoming._id)) return prev;

        const tempIndex = prev.findIndex((m) => m._id.startsWith("temp-"));
        if (tempIndex !== -1) {
          const next = [...prev];
          next[tempIndex] = {
            _id: String(incoming._id),
            senderType: incoming.senderType,
            body: incoming.body,
            createdAt: incoming.createdAt,
          };
          return next;
        }

        return [...prev, incoming];
      });
    };

    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("connect", join);
      socket.off("message:new", onNewMessage);
      socket.emit("conversation:leave", conversationId);
    };
  }, [conversationId, isOpen]);

  // Auto reply ကို socket message:new နဲ့ တစ်ခါ, REST response ထဲပါ နောက်တစ်ခါ
  // ပြန်ပေးတယ် — socket မရောက်တဲ့ instance မှာ user က greeting မမြင်ရအောင်။
  const appendAutoReplies = (items: unknown[]) => {
    const incoming = (items ?? []).filter(
      (item): item is ChatMessage =>
        Boolean(item) && typeof (item as ChatMessage).body === "string",
    );

    if (incoming.length === 0) return;

    setMessages((prev) => {
      const known = new Set(prev.map((msg) => msg._id));
      const next = [...prev];

      for (const msg of incoming) {
        const id = String(msg._id);
        if (known.has(id)) continue;
        known.add(id);
        next.push({
          _id: id,
          senderType: msg.senderType,
          body: msg.body,
          createdAt: msg.createdAt,
        });
      }

      return next;
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    const body = inputText.trim();
    if (!body) {
      showToast(t("support.needMessage"));
      return;
    }
    if (!conversationId) {
      showToast(t("support.notReady"));
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const newMessage: ChatMessage = {
      _id: tempId,
      senderType: "customer",
      body,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
    setSending(true);

    try {
      const res = await api.sendSupportMessage(conversationId, { body });
      appendAutoReplies(res.autoReplies);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      const message =
        err instanceof ApiError ? err.message : t("support.sendFailed");
      showToast(message);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="fixed inset-0 bg-black/60 z-0" onClick={onClose} />
      <div
        dir="ltr"
        className="bg-white w-full max-w-[500px] h-[90vh] rounded-t-[30px] flex flex-col shadow-2xl z-10"
      >
        <Toast toast={toast} compact />

        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-[#ff6600] text-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white text-[#ff6600] flex items-center justify-center">
              <Headphones size={16} />
            </div>
            <span className="font-semibold text-base">
              {t("support.title")}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t("support.close")}
            className="text-white hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">
              {t("support.loading")}
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex items-start ${
                    msg.senderType === "customer" ? "justify-end" : "gap-2.5"
                  }`}
                >
                  {msg.senderType === "admin" && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#ff782d] to-[#ff5100] flex items-center justify-center text-white font-bold text-[9px] shrink-0 shadow-md">
                      CS
                    </div>
                  )}

                  <div
                    className={`p-3.5 rounded-2xl shadow-sm max-w-[80%] text-xs leading-relaxed ${
                      msg.senderType === "customer"
                        ? "bg-[#ff6600] text-white rounded-tr-sm ml-auto"
                        : "bg-[#1a1a1a] text-white rounded-tl-sm"
                    }`}
                  >
                    {msg.body && <p>{msg.body}</p>}
                    <span
                      className={`text-[9px] mt-1 block ${
                        msg.senderType === "customer"
                          ? "text-orange-100"
                          : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-end">
                  <div className="w-6 h-6 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin"></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        <div className="bg-white border-t border-gray-100 p-3 shrink-0">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              placeholder={t("support.inputPlaceholder")}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={sending}
              className="flex-1 bg-gray-100 border border-gray-200 rounded-full px-4 py-2.5 text-xs text-gray-700 outline-none focus:border-[#ff6600] transition disabled:opacity-70"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              aria-label={t("support.send")}
              className="w-10 h-10 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] text-white rounded-full flex items-center justify-center shadow-md hover:opacity-95 transition shrink-0 active:scale-95 disabled:opacity-50"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
        </div>

        <div className="px-4 py-2 text-[10px] text-gray-500 text-center bg-gray-50 border-t border-gray-100 shrink-0">
          {t("support.guestNotice")}
        </div>
      </div>
    </div>
  );
}
