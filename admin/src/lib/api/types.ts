import type { MoneyValue } from "../money";

export type { MoneyValue } from "../money";

export interface ApiUser {
  id: string;
  name: string;
  phone: string;
  invitationCode: string;
  role: "user" | "owner" | "admin";
  status?: string;
  ownerId?: string | null;
  language?: string;
  balance?: MoneyValue;
  walletAddress?: string | null;
}

export interface ApiTransaction {
  _id: string;
  userId: string | { _id: string; name: string; phone: string; walletAddress?: string | null };
  type: "deposit" | "withdraw";
  amount: MoneyValue;
  status: "pending" | "accepted" | "rejected";
  proofScreenshot?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDeposit {
  _id: string;
  amount: MoneyValue;
}

// Plans page အတွက် user တစ်ခုလုံးရဲ့ deposit အခြေပြန် — accepted က အသစ်ဆုံး
// deposit ဖြစ်ပြီး freeAccepted က အသစ် round အတွက် ရသေးတဲ့ deposit ပဲ။
export interface ApiDepositSummary {
  userId: string;
  accepted: ApiDeposit | null;
  freeAccepted: ApiDeposit | null;
  pending: ApiDeposit[];
  balance: MoneyValue;
}

export interface ApiTask {
  _id: string;
  orderNumber: number;
  productName: string;
  productId?: string;
  imageUrl?: string;
  code?: string;
  category?: string;
  usage?: string;
  description?: string;
  price: string;
  commission: MoneyValue;
  status: "available" | "assigned" | "completed";
  isLuckyOrder?: boolean;
  completedAt?: string | null;
}

export interface ApiPlan {
  _id: string;
  userId: string;
  status: "draft" | "generated" | "completed";
  totalOrders: number;
  completedCount: number;
  currentBase?: string;
  luckyPositions?: {
    orderNumber: number;
    productId?: string | null;
    requiredDeposit: string;
    luckyCommission: string;
  }[];
}

export interface ApiProduct {
  _id: string;
  name: string;
  code?: string;
  category?: string;
  usage?: string;
  description?: string;
  imageUrl?: string | null;
  price: MoneyValue;
  commission?: MoneyValue | null;
  createdAt?: string;
}

export interface ApiAdminUser {
  _id: string;
  name: string;
  phone: string;
  invitationCode: string;
  role: "user" | "owner" | "admin";
  status: "online" | "offline" | "burned";
  balance?: MoneyValue;
  walletAddress?: string | null;
  cryptoAddress?: string | null;
  cryptoQrUrl?: string | null;
  ownerId?: string | null;
  language?: string;
  createdAt?: string;
  ipAddress?: string | null;
  lastLoginAt?: string | null;
  lastSeenAt?: string | null;
  lastDevice?: string | null;
  // Backend က lastSeenAt (၅ မိနစ် window) ကနေ တွက်ပေးတဲ့ presence။ status က
  // admin ရဲ့ Burn အလံသက်သက် — Online/Offline အတွက် မသုံးတော့ဘူး။
  online?: boolean;
  // Admin သီးသန့် မှတ်စု — owner ဆီ API က ဘယ်တော့မှ မပို့ဘူး။
  adminNote?: string | null;
}

// Order plan card board — user တစ်ယောက် + active plan (draft/generated)။
// Completed round တွေ plan: null အဖြစ် ပြမယ် (row က Mongo မှာ ဆက်ရှိတယ်)။
export interface ApiBoardRow {
  user: {
    _id: string;
    name: string;
    phone: string;
    invitationCode: string;
    balance?: MoneyValue;
  };
  plan: ApiPlan | null;
}

export interface ApiAdminStats {
  totalUsers: number;
  totalOwners: number;
  totalProducts: number;
  pendingDeposits: number;
  pendingWithdraws: number;
  acceptedVolume: string | number;
  totalPlans: number;
  generatedPlans: number;
  completedPlans: number;
}

export class ApiError extends Error {
  status: number;
  errors?: { path: (string | number)[]; message: string }[];

  constructor(status: number, message: string, errors?: { path: (string | number)[]; message: string }[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
