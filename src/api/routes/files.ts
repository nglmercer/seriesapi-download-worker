import { join, extname } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import type { FileService } from "../../services/file.service";

interface VideoFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  ext: string;
}

interface RouteResult {
  status: number;
  data: Record<string, unknown> | { files: VideoFile[] } | { error: string };
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".avi", ".mov", ".ts", ".m4v"]);

function walkDir(dir: string, base: string, results: VideoFile[], depth = 0) {
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
    const files: VideoFile[] = [];
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

  // Upload video file
  if (method === "POST" && path === "/api/v1/files/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return { status: 400, data: { error: "No file provided" } };
      }

      const ext = extname(file.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(ext)) {
        return { status: 400, data: { error: `Unsupported file type: ${ext}. Allowed: ${[...VIDEO_EXTENSIONS].join(", ")}` } };
      }

      const uploadsDir = fileService.getUploadsDir();
      fileService.ensureDir(uploadsDir);

      // Sanitize filename: strip path components, prefix with timestamp
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const destFilename = `${Date.now()}-${safeName}`;
      const destPath = join(uploadsDir, destFilename);

      await Bun.write(destPath, file);

      const stats = statSync(destPath);
      return {
        status: 200,
        data: {
          success: true,
          filename: destFilename,
          original_name: file.name,
          path: destFilename,
          size: stats.size,
        },
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { status: 500, data: { error: `Upload failed: ${message}` } };
    }
  }

  return null;
}
