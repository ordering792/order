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
let socketToken: string | null = null;

// Backend နဲ့ real-time connection (order match / complete events)
export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;

  const token = getToken();

  if (!token) {
    disconnectSocket();
    return null;
  }

  // Token ပြောင်းသွားရင် (logout → အခြား user နဲ့ login) connection အသစ်
  // ချမှတယ် — မဟုတ်ရင် ယခင် user ရဲ့ order event တွေ ပြန်ရမယ်။
  if (socket && socketToken === token) return socket;

  if (socket) disconnectSocket();

  socketToken = token;
  socket = io(SOCKET_URL, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
