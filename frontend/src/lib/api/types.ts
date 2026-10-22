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
  balance?: string;
  walletAddress?: string | null;
}

export interface ApiTransaction {
  _id: string;
  userId: string | { _id: string; name: string; phone: string; walletAddress?: string | null };
  type: "deposit" | "withdraw";
  amount: string;
  status: "pending" | "accepted" | "rejected";
  proofScreenshot?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
  assignedAt?: string | null;
  submittedAt?: string | null;
  rating?: number | null;
  feedback?: string | null;
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
}

export interface GrabOrder {
  id: string;
  orderNumber: number;
  orderId: string;
  productName: string;
  productImage: string | null;
  description: string;
  category: string;
  code: string;
  price: string;
  profit: string;
  requireDeposit: string;
  paidDeposit: string;
  isLuckyOrder: boolean;
  totalAmount: string;
  status: "available" | "assigned" | "completed";
  assignedAt: string | null;
  submittedAt: string | null;
  rating: number | null;
  feedback: string | null;
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
