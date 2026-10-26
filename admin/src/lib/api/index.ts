import { request } from "./client";
import type {
  ApiAdminStats,
  ApiAdminUser,
  ApiPlan,
  ApiProduct,
  ApiTask,
  ApiTransaction,
  ApiUser,
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
  }) =>
    request<{ transaction: ApiTransaction }>("/transactions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  myTransactions: () =>
    request<{ transactions: ApiTransaction[] }>("/transactions"),

  // ---- Orders / tasks ----
  myTasks: () => request<{ tasks: ApiTask[] }>("/tasks/my-tasks"),

  completeTask: (id: string) =>
    request<{ message: string; task: ApiTask }>(
      `/tasks/complete/${id}`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  myPlan: () => request<{ plan: ApiPlan }>("/orders/plans/my"),

  products: () => request<{ products: unknown[] }>("/products"),

  // ---- Admin / owner ----
  adminStats: () => request<{ stats: ApiAdminStats }>("/admin/stats"),


  adminListUsers: (params?: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.role) query.set("role", params.role);
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<{
      users: ApiAdminUser[];
      total: number;
      page: number;
      pages: number;
    }>(`/admin/users${qs ? `?${qs}` : ""}`);
  },

  adminUpdateUser: (
    id: string,
    body: {
      role?: "user" | "owner" | "admin";
      status?: "online" | "offline" | "burned";
      cryptoAddress?: string | null;
      cryptoQrUrl?: string | null;
    },
  ) =>
    request<{ user: ApiAdminUser }>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  adminListTransactions: (params?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.type) query.set("type", params.type);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<{ transactions: ApiTransaction[]; total: number; page: number; pages: number }>(
      `/transactions/admin${qs ? `?${qs}` : ""}`,
    );
  },

  acceptTransaction: (id: string) =>
    request<{ transaction: ApiTransaction }>(
      `/transactions/admin/${id}/accept`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  rejectTransaction: (id: string, rejectionReason: string) =>
    request<{ transaction: ApiTransaction }>(
      `/transactions/admin/${id}/reject`,
      { method: "POST", body: JSON.stringify({ rejectionReason }) },
    ),

  adminCreateProduct: (body: {
    name: string;
    code?: string;
    category?: string;
    usage?: string;
    description?: string;
    imageUrl?: string | null;
    price: string;
  }) =>
    request<{ product: ApiProduct }>("/products", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminUpdateProduct: (
    id: string,
    body: {
      name?: string;
      code?: string;
      category?: string;
      usage?: string;
      description?: string;
      imageUrl?: string | null;
      price?: string;
    },
  ) =>
    request<{ product: ApiProduct }>(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  adminDeleteProduct: (id: string) =>
    request<{ message: string }>(`/products/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }),

  adminBulkCreateProducts: (products: {
    name: string;
    code?: string;
    category?: string;
    usage?: string;
    description?: string;
    imageUrl?: string | null;
    price: string;
  }[]) =>
    request<{ count: number; products: ApiProduct[] }>("/products/bulk", {
      method: "POST",
      body: JSON.stringify({ products }),
    }),

  adminListPlans: (params?: { status?: string; userId?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.userId) query.set("userId", params.userId);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<{
      plans: (ApiPlan & { user?: { _id: string; name: string; phone: string } })[];
      total: number;
      page: number;
      pages: number;
    }>(`/orders/plans${qs ? `?${qs}` : ""}`);
  },

  adminCreatePlan: (body: {
    userId: string;
    totalOrders: number;
    luckyPositions?: {
      orderNumber: number;
      productId?: string | null;
      requiredDeposit: string;
      luckyCommission: string;
    }[];
  }) =>
    request<{ plan: ApiPlan }>("/orders/plans", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminListUserTasks: (userId: string, planId?: string) =>
    request<{ tasks: ApiTask[] }>(
      `/tasks/user/${userId}${planId ? `?planId=${encodeURIComponent(planId)}` : ""}`,
    ),

  adminGeneratePlan: (id: string, depositTransactionId: string) =>
    request<{ plan: ApiPlan }>(`/orders/plans/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({ depositTransactionId }),
    }),

  adminDeletePlan: (id: string) =>
    request<{ message: string }>(`/orders/plans/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    }),

  adminListOwners: () => request<{ owners: ApiAdminUser[] }>("/auth/owners"),

  adminCreateOwner: (body: {
    name: string;
    phone: string;
    password: string;
  }) =>
    request<{ owner: ApiAdminUser }>("/auth/owners", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminCreateAnnouncement: (body: { title: string; content: string }) =>
    request<{ announcement: unknown }>("/announcements", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminListAnnouncements: () =>
    request<{ announcements: unknown[] }>("/announcements"),

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

  adminListConversations: () =>
    request<{ conversations: unknown[]; total: number }>(
      "/support/admin/conversations",
    ),

  adminGetConversation: (id: string) =>
    request<{ conversation: unknown; messages: unknown[] }>(
      `/support/admin/conversations/${id}`,
    ),

  adminSendMessage: (id: string, body: string) =>
    request<{ message: unknown }>(`/support/admin/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  adminCloseConversation: (id: string) =>
    request<{ conversation: unknown }>(
      `/support/admin/conversations/${id}/close`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  adminOnlineStatus: () =>
    request<{ online: unknown }>("/support/admin/online"),

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
