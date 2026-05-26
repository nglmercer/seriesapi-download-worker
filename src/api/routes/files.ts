import { join, extname } from "path";
import { readdirSync, statSync } from "fs";
import type { FileService } from "../../services/file.service";

interface RouteResult {
  status: number;
  data: any;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".ts", ".m4v"]);

function walkDir(dir: string, base: string, results: any[], depth = 0) {
  if (depth > 5) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = join(base, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, relativePath, results, depth + 1);
      } else {
        const ext = extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          try {
            const stats = statSync(fullPath);
            results.push({
              name: entry.name,
              path: relativePath.replace(/\\/g, "/"),
              size: stats.size,
              modified: stats.mtime.toISOString(),
              ext,
            });
          } catch {}
        }
      }
    }
  } catch {}
}

export async function handleFilesRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  fileService: FileService,
): Promise<RouteResult | Response | null> {
  if (method === "GET" && path === "/api/v1/files") {
    const baseDir = fileService.getUploadsDir();
    const files: any[] = [];
    walkDir(baseDir, "", files);
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    return { status: 200, data: { files } };
  }

  const serveMatch = path.match(/^\/api\/v1\/files\/serve\/(.+)$/);
  if (serveMatch && method === "GET") {
    const filePath = serveMatch[1]!;
    const ext = extname(filePath).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) {
      return { status: 400, data: { error: "Only video files can be served" } };
    }
    const fullPath = join(fileService.getUploadsDir(), filePath);
    const file = Bun.file(fullPath);
    if (file.size === 0) {
      return { status: 404, data: { error: "File not found" } };
    }
    const mimeMap: Record<string, string> = {
      ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".webm": "video/webm",
      ".avi": "video/x-msvideo", ".mov": "video/quicktime", ".ts": "video/mp2t",
      ".m4v": "video/x-m4v",
    };
    return new Response(file, {
      headers: {
        "Content-Type": mimeMap[ext] || "video/mp4",
        "Accept-Ranges": "bytes",
      },
    });
  }

  return null;
}
