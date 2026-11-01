"use client";

import { CheckCircle } from "lucide-react";
import type { ToastState } from "../../lib/useToast";

type ToastProps = {
  toast: ToastState;
  compact?: boolean;
};

export default function Toast({ toast, compact = false }: ToastProps) {
  const box = compact
    ? "px-4 py-2.5 rounded-xl space-x-2"
    : "px-5 py-3 rounded-2xl space-x-2.5";

  return (
    <div
      className={`fixed top-5 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-xs ${box} shadow-2xl flex items-center z-50 transition-all duration-300 ${toast.show ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <CheckCircle className="text-emerald-400" size={compact ? 16 : 18} />
      <span>{toast.message}</span>
    </div>
  );
}
