import { extname } from "path";

export type DownloadCategory = "video" | "audio" | "subtitle" | "image" | "document";

export const categoryList: ReadonlyArray<DownloadCategory> = ["video", "audio", "subtitle", "image", "document"];

export function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".webm": "video/webm", ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav",
    ".vtt": "text/vtt", ".srt": "application/x-subrip", ".ass": "text/x-ass", ".ssa": "text/x-ssa",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".json": "application/json", ".xml": "application/xml",
    ".torrent": "application/x-bittorrent",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}

export function detectCategoryFromMime(mimeType: string): DownloadCategory {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "text/vtt" || mimeType === "application/x-subrip" || mimeType.startsWith("text/")) return "subtitle";
  return "document";
}

export function detectCategory(filename: string): DownloadCategory {
  const ext = extname(filename).toLowerCase();
  const mimeType = getMimeType(ext);
  return detectCategoryFromMime(mimeType);
}

export function detectCategoryFromURL(url: string): DownloadCategory {
  const filename = url.split("/").pop() || "";
  return detectCategory(filename);
}
