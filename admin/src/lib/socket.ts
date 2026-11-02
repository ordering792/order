"use client";

import { io, type Socket } from "socket.io-client";
import { getToken } from "./api/client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api").replace(
    /\/api\/?$/,
    "",
  );

let socket: Socket | null = null;
let socketAuthKey: string | null = null;

// Backend နဲ့ real-time connection (order match / complete events)။
// Login မလုပ်တဲ့ support visitor အတွက် guestId handshake ကိုလည်း ခွင့်ပြုတယ် —
// backend authenticate() က token ကို အရင်ဦးစားပေးတယ်။
export function getSocket(guestId?: string): Socket | null {
  if (typeof window === "undefined") return null;

  const token = getToken();
  const authKey = token ?? (guestId ? `guest:${guestId}` : null);

  if (!authKey) {
    disconnectSocket();
    return null;
  }

  // Identity ပြောင်းသွားရင် (logout → အခြား user နဲ့ login) connection အသစ်
  // ချမှတယ် — မဟုတ်ရင် ယခင် user ရဲ့ order event တွေ ပြန်ရမယ်။
  if (socket && socketAuthKey === authKey) return socket;

  if (socket) disconnectSocket();

  socketAuthKey = authKey;
  socket = io(SOCKET_URL, {
    path: "/socket.io",
    auth: token ? { token } : { guestId },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketAuthKey = null;
}
