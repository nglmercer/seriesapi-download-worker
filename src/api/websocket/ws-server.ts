import { getEventBus } from "../../services/queue/queue.events";
import { validateToken } from "./ws-auth";
import type { ServerWebSocket, Server } from "bun";

interface WSClient {
  ws: ServerWebSocket<unknown>;
  userId: number;
}

interface WSAuthData {
  userId?: number;
  authenticated: boolean;
}

export class WebSocketServer {
  private clients = new Map<ServerWebSocket<unknown>, WSClient>();
  private userClients = new Map<number, Set<ServerWebSocket<unknown>>>();
  private jobSubscriptions = new Map<string, Set<number>>();
  private entitySubscriptions = new Map<string, Set<number>>();
  private mainApiUrl: string;
  private sharedApiKey: string;

  constructor(mainApiUrl: string, sharedApiKey: string) {
    this.mainApiUrl = mainApiUrl;
    this.sharedApiKey = sharedApiKey;
  }

  getWebSocketHandlers() {
    return {
      open: (ws: ServerWebSocket<unknown>) => {
        console.log("[ws] New connection, awaiting auth");
      },
      message: async (
        ws: ServerWebSocket<unknown>,
        message: string | Buffer,
      ) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(ws, data);
        } catch (err) {
          ws.send(
            JSON.stringify({ type: "error", error: "Invalid message format" }),
          );
        }
      },
      close: (ws: ServerWebSocket<unknown>, code: number, reason: string) => {
        this.handleClose(ws);
      },
      drain: (ws: ServerWebSocket<unknown>) => {},
    };
  }

  private async handleMessage(
    ws: ServerWebSocket<unknown>,
    data: Record<string, unknown>,
  ) {
    switch (data.type) {
      case "auth": {
        const token = data.token as string;
        if (!token) {
          ws.close(4001, "Missing token");
          return;
        }
        const result = await validateToken(
          token,
          this.mainApiUrl,
          this.sharedApiKey,
        );
        if (!result.valid || !result.userId) {
          ws.close(4001, "Invalid token");
          return;
        }
        const client: WSClient = { ws, userId: result.userId };
        this.clients.set(ws, client);
        if (!this.userClients.has(result.userId)) {
          this.userClients.set(result.userId, new Set());
        }
        this.userClients.get(result.userId)!.add(ws);
        ws.send(
          JSON.stringify({
            type: "connected",
            userId: result.userId,
            message: "Authenticated",
          }),
        );
        break;
      }
      case "subscribe:job": {
        const client = this.clients.get(ws);
        if (!client) return;
        const jobId = data.jobId as string;
        if (!jobId) return;
        if (!this.jobSubscriptions.has(jobId)) {
          this.jobSubscriptions.set(jobId, new Set());
        }
        this.jobSubscriptions.get(jobId)!.add(client.userId);
        break;
      }
      case "unsubscribe:job": {
        const client = this.clients.get(ws);
        if (!client) return;
        const jobId = data.jobId as string;
        if (!jobId) return;
        const subs = this.jobSubscriptions.get(jobId);
        if (subs) subs.delete(client.userId);
        break;
      }
      case "subscribe:entity": {
        const client = this.clients.get(ws);
        if (!client) return;
        const key = `${data.entityType}:${data.entityId}`;
        if (!this.entitySubscriptions.has(key)) {
          this.entitySubscriptions.set(key, new Set());
        }
        this.entitySubscriptions.get(key)!.add(client.userId);
        break;
      }
      case "unsubscribe:entity": {
        const client = this.clients.get(ws);
        if (!client) return;
        const key = `${data.entityType}:${data.entityId}`;
        const subs = this.entitySubscriptions.get(key);
        if (subs) subs.delete(client.userId);
        break;
      }
      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }
    }
  }

  private handleClose(ws: ServerWebSocket<unknown>) {
    const client = this.clients.get(ws);
    if (!client) return;

    this.clients.delete(ws);
    const userSet = this.userClients.get(client.userId);
    if (userSet) {
      userSet.delete(ws);
      if (userSet.size === 0) this.userClients.delete(client.userId);
    }

    for (const [, subs] of this.jobSubscriptions) {
      subs.delete(client.userId);
    }
    for (const [, subs] of this.entitySubscriptions) {
      subs.delete(client.userId);
    }
  }

  subscribeToEvents() {
    const bus = getEventBus();

    bus.on("download:progress", (taskId, userId, progress, data) => {
      const subs = this.jobSubscriptions.get(taskId);
      const message = JSON.stringify({
        type: "download:progress",
        taskId,
        userId,
        progress,
        ...data,
      });
      if (subs) {
        for (const uid of subs) {
          const clients = this.userClients.get(uid);
          if (clients) {
            for (const ws of clients) {
              try {
                ws.send(message);
              } catch {}
            }
          }
        }
      }
    });

    bus.on("transcode:progress", (data) => {
      const subs = this.jobSubscriptions.get(String(data.taskId));
      const message = JSON.stringify({ type: "transcode:progress", ...data });
      if (subs) {
        for (const uid of subs) {
          const clients = this.userClients.get(uid);
          if (clients) {
            for (const ws of clients) {
              try {
                ws.send(message);
              } catch {}
            }
          }
        }
      }
      if (data.userId) {
        const clients = this.userClients.get(data.userId);
        if (clients) {
          for (const ws of clients) {
            try {
              ws.send(message);
            } catch {}
          }
        }
      }
    });

    bus.on("hls:ready", (data) => {
      const message = JSON.stringify({ type: "hls:ready", ...data });
      if (data.media_id) {
        const mediaSubs = this.entitySubscriptions.get(
          `media:${data.media_id}`,
        );
        if (mediaSubs) {
          for (const uid of mediaSubs) {
            const clients = this.userClients.get(uid);
            if (clients)
              for (const ws of clients) {
                try {
                  ws.send(message);
                } catch {}
              }
          }
        }
      }
      if (data.season_id) {
        const seasonSubs = this.entitySubscriptions.get(
          `season:${data.season_id}`,
        );
        if (seasonSubs) {
          for (const uid of seasonSubs) {
            const clients = this.userClients.get(uid);
            if (clients)
              for (const ws of clients) {
                try {
                  ws.send(message);
                } catch {}
              }
          }
        }
      }
      if (data.episode_id) {
        const episodeSubs = this.entitySubscriptions.get(
          `episode:${data.episode_id}`,
        );
        if (episodeSubs) {
          for (const uid of episodeSubs) {
            const clients = this.userClients.get(uid);
            if (clients)
              for (const ws of clients) {
                try {
                  ws.send(message);
                } catch {}
              }
          }
        }
      }
    });
  }
}
