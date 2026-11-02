import { getToken } from "./api/client";

const GUEST_ID_KEY = "guestId";

// Backend `guestOrAuth` က token မရှိတဲ့ request တွေကို body/query ထဲက guestId
// နဲ့ ခွဲသိမ်းတယ် — ဒါကြောင့် ဒီ id က guest support conversation အားလုံးရဲ့
// identity handle ဖြစ်တယ်။ Token ရှိတဲ့အခါ လုံးဝမပို့ဘူး: token ပျက်တဲ့ request
// က guest အဖြစ် fall through လုပ်ပြီး user data ကို နှစ်ခွဲဖြစ်စေမယ်။
export function ensureGuestId(): string | null {
  if (typeof window === "undefined") return null;
  if (getToken()) return null;

  const existing = window.localStorage.getItem(GUEST_ID_KEY);
  if (existing && existing.length <= 64) return existing;

  const created = createGuestId();
  window.localStorage.setItem(GUEST_ID_KEY, created);
  return created;
}

export function guestBody(): { guestId?: string } {
  const guestId = ensureGuestId();
  return guestId ? { guestId } : {};
}

export function guestQuery(): string {
  const guestId = ensureGuestId();
  return guestId ? `?guestId=${encodeURIComponent(guestId)}` : "";
}

// crypto.randomUUID က secure context မှာပဲ ရှိတယ် — LAN http နဲ့ စမ်းတဲ့အခါ
// insecure context မှာရတဲ့ getRandomValues ကို ပြန်သုံးတယ်။ guestId က capability
// token ဖြစ်လို့ Math.random လို ခန့်မှန်းလို့ရတဲ့ source ဘယ်တော့မှ မသုံးဘူး။
function createGuestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
