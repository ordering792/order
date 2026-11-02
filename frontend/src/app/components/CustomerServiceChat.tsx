"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Headphones, Bot, UserCircle } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { getSocket } from "../../lib/socket";
import { useToast } from "../../lib/useToast";

interface ChatMessage {
  _id: string;
  senderType: "customer" | "admin" | "ai";
  senderName?: string | null;
  body: string;
  createdAt: string;
}

interface CustomerServiceChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const GUEST_ID_KEY = "rakuten_guest_id";
const GUEST_NAME_KEY = "rakuten_guest_name";

function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return "";
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = "guest_" + Math.random().toString(36).substring(2, 15);
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

function getOrCreateGuestName(): string {
  if (typeof window === "undefined") return "";
  let guestName = localStorage.getItem(GUEST_NAME_KEY);
  if (!guestName) {
    guestName = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(GUEST_NAME_KEY, guestName);
  }
  return guestName;
}

export default function CustomerServiceChat({
  isOpen,
  onClose,
}: CustomerServiceChatProps) {
  const { user } = useAuth();
  const t = useT();
  const { toast, showToast } = useToast(2000);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const guestId = getOrCreateGuestId();
  const guestName = getOrCreateGuestName();
  const isGuest = !user;

  useEffect(() => {
    setDisplayName(isGuest ? guestName : user?.name || "");
  }, [isGuest, guestName, user]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const startOrLoad = async () => {
      try {
        if (isGuest) {
          const existing = localStorage.getItem("rakuten_guest_conv_id");
          if (existing) {
            setConversationId(existing);
            const data = await api.getConversation(existing);
            const msgs = (data.messages as ChatMessage[]).map((m) => ({
              _id: m._id,
              senderType: m.senderType as ChatMessage["senderType"],
              senderName: m.senderName || null,
              body: m.body,
              createdAt: m.createdAt,
            }));
            setMessages(msgs);
            setLoading(false);
            return;
          }
          const created = await api.startConversation({
            subject: t("support.subject"),
            guestId,
            guestName,
          });
          const conv = created.conversation as { _id: string };
          setConversationId(conv._id);
          localStorage.setItem("rakuten_guest_conv_id", conv._id);
          const data = await api.getConversation(conv._id);
          const msgs = (data.messages as ChatMessage[]).map((m) => ({
            _id: m._id,
            senderType: m.senderType as ChatMessage["senderType"],
            senderName: m.senderName || null,
            body: m.body,
            createdAt: m.createdAt,
          }));
          setMessages(msgs);
        } else {
          const res = await api.myConversations();
          if (res.conversations.length > 0) {
            const conv = res.conversations[0] as { _id: string };
            setConversationId(conv._id);
            const data = await api.getConversation(conv._id);
            const msgs = (data.messages as ChatMessage[]).map((m) => ({
              _id: m._id,
              senderType: m.senderType as ChatMessage["senderType"],
              senderName: m.senderName || null,
              body: m.body,
              createdAt: m.createdAt,
            }));
            setMessages(msgs);
          } else {
            const created = await api.startConversation({
              subject: t("support.subject"),
            });
            const conv = created.conversation as { _id: string };
            setConversationId(conv._id);
            const data = await api.getConversation(conv._id);
            const msgs = (data.messages as ChatMessage[]).map((m) => ({
              _id: m._id,
              senderType: m.senderType as ChatMessage["senderType"],
              senderName: m.senderName || null,
              body: m.body,
              createdAt: m.createdAt,
            }));
            setMessages(msgs);
          }
        }
      } catch {
        showToast(t("support.loadFailed"));
      } finally {
        setLoading(false);
      }
    };
    void startOrLoad();
  }, [isOpen, user, isGuest, guestId, guestName, t, showToast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;
    const socket = getSocket();
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
            senderName: incoming.senderName || null,
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
      senderName: displayName,
      body,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
    setSending(true);

    try {
      await api.sendSupportMessage(conversationId, { body });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      const message = err instanceof ApiError ? err.message : t("support.sendFailed");
      showToast(message);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div
        className="fixed inset-0 bg-black/60 z-0"
        onClick={onClose}
      />
      <div
        dir="ltr"
        className="bg-white w-full max-w-[500px] h-[90vh] rounded-t-[30px] flex flex-col shadow-2xl z-10"
      >
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-[#ff6600] text-white">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-white text-[#ff6600] flex items-center justify-center font-bold text-xs">
              <Headphones size={16} />
            </div>
            <span className="font-semibold text-base">{t("support.title")}</span>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">{t("support.you")}</span>
            <span className="text-xs font-bold text-gray-800">{displayName}</span>
            {isGuest && (
              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
                {t("support.guest")}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 pb-20">
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
                    msg.senderType === "customer" ? "justify-end" : "space-x-2.5"
                  }`}
                >
                  {msg.senderType !== "customer" && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md">
                      {msg.senderType === "ai" ? (
                        <Bot size={14} />
                      ) : (
                        <UserCircle size={14} />
                      )}
                      {msg.senderType === "ai" ? "AI" : "CS"}
                    </div>
                  )}

                  <div
                    className={`p-3.5 rounded-2xl shadow-sm max-w-[80%] text-xs leading-relaxed ${
                      msg.senderType === "customer"
                        ? "bg-[#ff6600] text-white rounded-tr-sm ml-auto"
                        : msg.senderType === "ai"
                        ? "bg-white border border-gray-100 text-gray-700 rounded-tl-sm text-gray-600"
                        : "bg-[#1a1a1a] text-white rounded-tl-sm"
                    }`}
                  >
                    {msg.body && <p>{msg.body}</p>}
                    <span
                      className={`text-[9px] mt-1 block ${
                        msg.senderType === "customer"
                          ? "text-orange-100"
                          : msg.senderType === "ai"
                          ? "text-gray-400"
                          : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {msg.senderType === "customer" && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md bg-[#ff6600]">
                      <UserCircle size={14} />
                    </div>
                  )}
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

        <div className="bg-white border-t border-gray-100 p-3">
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
              className="w-10 h-10 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] text-white rounded-full flex items-center justify-center shadow-md hover:opacity-95 transition shrink-0 active:scale-95 disabled:opacity-50"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
        </div>

        {isGuest && (
          <div className="px-4 py-2 text-xs text-gray-500 text-center bg-gray-50 border-t border-gray-100">
            {t("support.guestNotice")}
          </div>
        )}
      </div>
    </div>
  );
}
