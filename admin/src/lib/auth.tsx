"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  api,
  ApiError,
  ApiUser,
  clearSession,
  getStoredUser,
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

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async () => {
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
    }
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
