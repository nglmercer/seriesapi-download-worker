import type { SqliteNapiAdapter } from "../core/index";
import type { FileService } from "../services/file.service";
import type { WorkerConfig } from "../config";
import { handleDownloadRoute } from "./routes/downloads";
import { handleQueueRoute } from "./routes/queue";
import { downloadService } from "./server";

function requireAuth(req: Request, config: WorkerConfig): boolean {
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${config.sharedApiKey}`;
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createRouter(
  db: SqliteNapiAdapter,
  fileService: FileService,
  config: WorkerConfig,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-User-Id",
        },
      });
    }

    const corsHeaders = { "Access-Control-Allow-Origin": "*" };

    // Health check
    if (path === "/health" && method === "GET") {
      return jsonResponse({ status: "online", version: "1.0.0", uptime: process.uptime() });
    }

    // Auth check for API routes
    if (path.startsWith("/api/")) {
      if (!requireAuth(req, config)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    // Extract user ID from header
    const userId = parseInt(req.headers.get("X-User-Id") || "0", 10) || null;

    // Download routes
    if (path.startsWith("/api/v1/downloads")) {
      const result = await handleDownloadRoute(method, path, url, req, userId);
      if (result !== null) {
        return new Response(JSON.stringify(result.data), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Queue routes
    if (path.startsWith("/api/v1/queue")) {
      const result = await handleQueueRoute(method, path, url, req, db, fileService, userId);
      if (result !== null) {
        return new Response(JSON.stringify(result.data), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };
}
