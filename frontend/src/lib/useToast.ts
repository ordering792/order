import { useCallback, useEffect, useRef, useState } from "react";

export type ToastState = { show: boolean; message: string };

export const TOAST_DEFAULT_MS = 2500;

// Page တစ်ခုစီက ကိုယ်ပိုင် toast ထားရှိပြီး timer ကို ref မှာ သိမ်းတယ်။
// Unmount ဖြစ်ချိန် မရှင်းရင် unmounted component ပေါ်မှာ setState ခေါ်မိတယ်။
export function useToast(durationMs: number = TOAST_DEFAULT_MS) {
  const [toast, setToast] = useState<ToastState>({ show: false, message: "" });
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (message: string) => {
      clearTimer();
      setToast({ show: true, message });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setToast({ show: false, message: "" });
      }, durationMs);
    },
    [clearTimer, durationMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast };
}
