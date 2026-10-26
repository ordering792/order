import { request } from "./client";
import type {
  ApiPlan,
  ApiTask,
  ApiTransaction,
  ApiUser,
  GrabOrder,
  MoneyValue,
} from "./types";

export * from "./types";
export {
  clearSession,
  getStoredUser,
  SESSION_EXPIRED_EVENT,
  storeSession,
} from "./client";

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),

  // ---- Auth / account ----
  register: (input: {
    name: string;
    phone: string;
    password: string;
    invitationCode: string;
    referredByCode?: string;
  }) =>
    request<{ token: string; user: ApiUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  login: (input: { phone: string; password: string }) =>
    request<{ token: string; user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  me: () => request<{ user: ApiUser }>("/auth/me"),

  updateLanguage: (language: string) =>
    request<{ user: { id: string; language: string } }>("/auth/language", {
      method: "PUT",
      body: JSON.stringify({ language }),
    }),

  getLanguages: () =>
    request<{ languages: { name: string; code: string }[] }>("/auth/languages"),

  updateWalletAddress: (walletAddress: string) =>
    request<{ message: string }>("/auth/wallet-address", {
      method: "PUT",
      body: JSON.stringify({ walletAddress }),
    }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ message: string }>("/auth/password", {
      method: "PUT",
      body: JSON.stringify({ oldPassword, newPassword }),
    }),

  // ---- Wallet / deposits ----
  updateOwnerCryptoAddress: (cryptoAddress: string, qrUrl?: string | null) =>
    request<{ message: string }>("/auth/owner/crypto-address", {
      method: "PUT",
      body: JSON.stringify({ cryptoAddress, qrUrl: qrUrl ?? null }),
    }),

  depositInfo: () =>
    request<{
      cryptoAddress: string | null;
      qrUrl: string | null;
      payTo: string | null;
      source: "owner" | "admin" | null;
    }>("/auth/deposit-info"),

  profits: () =>
    request<{
      profits: {
        total: MoneyValue;
        today: MoneyValue;
        yesterday: MoneyValue;
        team: MoneyValue;
      };
    }>("/auth/profits"),

  createTransaction: (input: {
    type: "deposit" | "withdraw";
    amount: string;
    proofScreenshot?: string;
    password?: string;
  }) =>
    request<{ transaction: ApiTransaction }>("/transactions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  myTransactions: () =>
    request<{ transactions: ApiTransaction[] }>("/transactions"),

  // ---- Orders / tasks ----
  myTasks: () => request<{ tasks: ApiTask[] }>("/tasks/my-tasks"),

  // ---- Grab / matching flow ----
  grabSummary: () =>
    request<{
      summary: {
        balance: string;
        totalCommission: string;
        freezeBalance: string;
        totalOrderNumber: number;
        vipLevel: string;
        commissionRate: string;
        completedCount: number;
        remainingCount: number;
        undoneCount: number;
        activeOrder: GrabOrder | null;
      };
    }>("/tasks/summary"),

  matchOrder: () =>
    request<{
      order: GrabOrder;
      balance: string;
      needsDeposit: boolean;
      shortBy: string;
    }>("/tasks/match", { method: "POST", body: JSON.stringify({}) }),

  submitOrder: (id: string, input: { rating?: number; feedback?: string }) =>
    request<{ task: ApiTask }>(`/tasks/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  myOrders: () =>
    request<{
      tasks: ApiTask[];
      plan: {
        _id: string;
        totalOrders: number;
        completedCount: number;
        status: string;
      } | null;
    }>("/tasks/orders"),

  completeTask: (id: string) =>
    request<{ message: string; task: ApiTask }>(
      `/tasks/complete/${id}`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  myPlan: () => request<{ plan: ApiPlan }>("/orders/plans/my"),

  products: () => request<{ products: unknown[] }>("/products"),

  // ---- Support ----
  startConversation: (input: { subject?: string }) =>
    request<{ conversation: unknown }>("/support/conversations", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  myConversations: () =>
    request<{ conversations: unknown[]; total: number }>(
      "/support/conversations",
    ),

  getConversation: (id: string) =>
    request<{ conversation: unknown; messages: unknown[] }>(
      `/support/conversations/${id}`,
    ),

  sendSupportMessage: (id: string, input: { body: string }) =>
    request<{ message: unknown }>(`/support/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  closeConversation: (id: string) =>
    request<{ conversation: unknown }>(
      `/support/conversations/${id}/close`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  uploadAuth: (purpose: "product" | "deposit-proof") =>
    request<{
      token: string;
      expire: number;
      signature: string;
      publicKey: string;
      urlEndpoint: string;
      folder: string;
    }>(`/uploads/auth?purpose=${encodeURIComponent(purpose)}`),
};
