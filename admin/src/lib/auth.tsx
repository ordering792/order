"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  api,
  ApiError,
  ApiUser,
  clearSession,
  getStoredUser,
  SESSION_EXPIRED_EVENT,
  storeSession,
} from "./api";
import { getToken } from "./api/client";

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    phone: string;
    password: string;
    invitationCode: string;
    referredByCode?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }
    setLoading(false);
  }, []);

  // Token ပျက်တဲ့ request တိုင်းမှာ client က ဒီ event ကို ပို့တယ် —
  // page အတိုင်းအတာနဲ့ 401 ကို မဖမ်းနိုင်လို့ session level မှာ ပိတ်တယ်။
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const refreshUser = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = (async () => {
      try {
        const { user: fresh } = await api.me();
        setUser(fresh);
        const token = localStorage.getItem("token");
        if (token) storeSession(token, fresh);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setUser(null);
        }
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, []);

  // Home/profile/withdraw က auth user ရဲ့ balance ကိုပဲ ပြတယ်။ ဒီ user က
  // login အချိန်က localStorage copy သက်သက် ဖြစ်နေလို့ grab မှာ commission
  // ရသွားလည်း အဟောင်းကိုပဲ ပြနေတာ။ Page ပြောင်းတိုင်းနဲ့ tab ပြန်ဝင်တိုင်း
  // server ကနေ အသစ်ယူမယ် — token မရှိတဲ့ guest အတွက် ဘယ်တော့မှ မခေါ်ဘူး။
  useEffect(() => {
    if (!getToken()) return;
    void refreshUser();
  }, [pathname, refreshUser]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !getToken()) return;
      void refreshUser();
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshUser]);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api.login({ phone, password });
    storeSession(res.token, res.user);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (input: {
      name: string;
      phone: string;
      password: string;
      invitationCode: string;
      referredByCode?: string;
    }) => {
      const res = await api.register(input);
      storeSession(res.token, res.user);
      setUser(res.user);
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
