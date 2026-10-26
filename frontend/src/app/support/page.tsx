// src/app/support/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, Send, CheckCircle,
  Home, ClipboardList, Headphones, User
} from "lucide-react";
import CountryLanguageModal from "../components/CountryLanguageModal";
import { getStoredLang } from "../../lib/language";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import RequireAuth from "../components/RequireAuth";

interface ChatMessage {
  _id: string;
  senderType: "customer" | "admin";
  body: string;
  createdAt: string;
}

export default function SupportPage() {
  const { user } = useAuth();
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(getStoredLang);
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: "" });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 2000);
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.myConversations()
      .then((res) => {
        if (res.conversations.length > 0) {
          const conv = res.conversations[0] as { _id: string };
          setConversationId(conv._id);
          return api.getConversation(conv._id);
        }
        return api.startConversation({ subject: t("support.subject") }).then((created) => {
          const conv = created.conversation as { _id: string };
          setConversationId(conv._id);
          return api.getConversation(conv._id);
        });
      })
      .then((data) => {
        const msgs = (data.messages as ChatMessage[]).map((m) => ({
          _id: m._id,
          senderType: m.senderType,
          body: m.body,
          createdAt: m.createdAt,
        }));
        setMessages(msgs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    try {
      await api.sendSupportMessage(conversationId, { body });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      const message = err instanceof ApiError ? err.message : t("support.sendFailed");
      showToast(message);
    }
  };

  return (
    <RequireAuth>
    <div className="bg-[#1e293b] flex justify-center items-center min-h-screen m-0 p-0 overflow-hidden">
      <div className="w-full max-w-[500px] h-screen bg-white shadow-2xl flex flex-col justify-between relative overflow-hidden">

        <div className={`fixed top-5 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 z-50 transition-all duration-300 ${toast.show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <CheckCircle className="text-emerald-400" size={16} />
          <span>{toast.message}</span>
        </div>

        <div className="w-full bg-white px-4 py-3 flex justify-between items-center border-b shadow-sm z-30 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="bg-[#7a3cdb] text-white font-bold w-8 h-8 flex items-center justify-center rounded-lg">
              R
            </div>
            <span className="font-semibold text-gray-800 text-base">{t("support.title")}</span>
          </div>

          <button
            onClick={() => setIsLangModalOpen(true)}
            className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 hover:bg-gray-100 transition"
          >
            <span className={`fi fi-${selectedLanguage.code} w-6 h-4 object-cover rounded-sm shadow-sm`}></span>
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar p-4 space-y-4 bg-gray-50 pb-20">

          {loading ? (
            <div className="text-center text-gray-400 py-10 text-sm">{t("support.loading")}</div>
          ) : (
            messages.map((msg) => (
              <div key={msg._id} className={`flex items-start ${msg.senderType === 'customer' ? 'justify-end' : 'space-x-2.5'}`}>

                {msg.senderType === 'admin' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ff782d] to-[#ff5100] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md">
                    CS
                  </div>
                )}

                <div className={`p-3.5 rounded-2xl shadow-sm max-w-[75%] text-xs leading-relaxed ${
                  msg.senderType === 'customer'
                    ? 'bg-[#ff6600] text-white rounded-tr-sm'
                    : 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm'
                }`}>
                  {msg.body && <p>{msg.body}</p>}
                  <span className={`text-[9px] mt-1 block ${msg.senderType === 'customer' ? 'text-orange-100' : 'text-gray-400'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>

              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="bg-white border-t border-gray-100 p-3 z-30 shrink-0">
          <form onSubmit={handleSendMessage} className="flex flex-col space-y-2">

            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder={t("support.inputPlaceholder")}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-full px-4 py-2.5 text-xs text-gray-700 outline-none focus:border-[#ff6600] transition"
              />

              <button type="submit" className="w-10 h-10 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] text-white rounded-full flex items-center justify-center shadow-md hover:opacity-95 transition shrink-0 active:scale-95">
                <Send size={18} className="ml-0.5" />
              </button>
            </div>
          </form>
        </div>

        <nav className="w-full bg-white border-t border-gray-100 flex justify-around items-center py-1.5 px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 shrink-0 relative">
          <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <Home size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.home")}</span>
          </Link>
          <Link href="/orders" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <ClipboardList size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.orders")}</span>
          </Link>

          <Link href="/grab" className="flex flex-col items-center relative -top-4 group">
            <div className="w-12 h-12 bg-gradient-to-tr from-[#ff782d] to-[#ff5100] rounded-full flex items-center justify-center border-4 border-white shadow-md text-white transition transform group-hover:scale-105 active:scale-95 overflow-hidden">
              <img src="/images/11321466.gif" alt="Icon" className="w-full h-full object-contain" />
            </div>
          </Link>

          <Link href="/support" className="flex flex-col items-center text-[#ff6600] transition">
            <Headphones size={22} />
            <span className="text-[9px] font-bold mt-1">{t("nav.support")}</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center text-gray-400 hover:text-orange-600 transition">
            <User size={22} />
            <span className="text-[9px] font-medium mt-1">{t("nav.profile")}</span>
          </Link>
        </nav>

      </div>

      <CountryLanguageModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        onSelect={(lang) => setSelectedLanguage(lang)}
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ff782d; border-radius: 10px; }
      `}</style>
    </div>
    </RequireAuth>
  );
}
