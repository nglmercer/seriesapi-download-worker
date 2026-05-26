import { signal } from "@preact/signals";
import type { WsMessage } from "../types";

export const wsConnected = signal(false);
export const wsMessages = signal<WsMessage[]>([]);

type MessageHandler = (msg: WsMessage) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
const handlers = new Set<MessageHandler>();
const subscribedJobs = new Set<string>();
const subscribedEntities = new Set<string>();

function getWsUrl(): string {
  const stored = localStorage.getItem("worker-api-config");
  if (stored) {
    const cfg = JSON.parse(stored);
    if (cfg.baseUrl) {
      const base = cfg.baseUrl.replace(/^http/, "ws");
      return `${base}/ws`;
    }
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function getToken(): string {
  const stored = localStorage.getItem("worker-api-config");
  if (stored) return JSON.parse(stored).apiKey || "";
  return "";
}

export function connect() {
  if (socket?.readyState === WebSocket.OPEN) return;

  const url = getWsUrl();
  socket = new WebSocket(url);

  socket.onopen = () => {
    const token = getToken();
    if (token) {
      socket!.send(JSON.stringify({ type: "auth", token }));
    }
    pingTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data) as WsMessage;
      if (msg.type === "connected") {
        wsConnected.value = true;
        for (const jobId of subscribedJobs) {
          socket!.send(JSON.stringify({ type: "subscribe:job", jobId }));
        }
        for (const ent of subscribedEntities) {
          const [entityType, entityId] = ent.split(":");
          socket!.send(JSON.stringify({ type: "subscribe:entity", entityType, entityId: Number(entityId) }));
        }
      }
      wsMessages.value = [...wsMessages.value.slice(-199), msg];
      for (const h of handlers) h(msg);
    } catch {}
  };

  socket.onclose = () => {
    wsConnected.value = false;
    if (pingTimer) clearInterval(pingTimer);
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

export function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  socket?.close();
  socket = null;
  wsConnected.value = false;
}

export function subscribeJob(jobId: string) {
  subscribedJobs.add(jobId);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "subscribe:job", jobId }));
  }
}

export function unsubscribeJob(jobId: string) {
  subscribedJobs.delete(jobId);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "unsubscribe:job", jobId }));
  }
}

export function subscribeEntity(entityType: string, entityId: number) {
  const key = `${entityType}:${entityId}`;
  subscribedEntities.add(key);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "subscribe:entity", entityType, entityId }));
  }
}

export function unsubscribeEntity(entityType: string, entityId: number) {
  const key = `${entityType}:${entityId}`;
  subscribedEntities.delete(key);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "unsubscribe:entity", entityType, entityId }));
  }
}

export function onMessage(handler: MessageHandler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
