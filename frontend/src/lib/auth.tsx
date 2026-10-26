"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  api,
  ApiError,
  ApiUser,
  clearSession,
  getStoredUser,
  SESSION_EXPIRED_EVENT,
  storeSession,
} from "./api";

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
