import { ApiError, type ApiUser } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

// AuthProvider ဒီ event ကို နားထောင်ပြီး user ကို cleared ပြတယ်။
export const SESSION_EXPIRED_EVENT = "auth:expired";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: ApiUser) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const token = getToken();
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...requestOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const headers: Record<string, string> = {
    ...(requestOptions.headers as Record<string, string>),
  };

  if (!(requestOptions.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      headers,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Token ပျက်ရင် session ကို ရှင်းပြီး event ပို့တယ် — page တွေက
      // .catch(() => {}) နဲ့ ဖုံးအုပ်ထားလို့ 401 ကို ဘယ်သူမှ မသိရဘူး။
      if (res.status === 401 && typeof window !== "undefined") {
        clearSession();
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }

      throw new ApiError(
        res.status,
        data.message || `Request failed (${res.status})`,
        data.errors,
      );
    }

    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
