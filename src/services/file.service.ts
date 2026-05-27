import { join, extname, dirname, isAbsolute } from "path";
import { existsSync, mkdirSync, copyFileSync, statSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/index";
import { filesTable } from "../schema/files";

let gStorageBaseDir: string = "";
let gFileService: FileService | null = null;

export function setStaticFileService(dir: string) {
  gStorageBaseDir = dir;
  gFileService = new FileService(dir);
}

function gf(): FileService {
  if (!gFileService) throw new Error("FileService static not initialized");
  return gFileService;
}

export interface FileRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  category: string | null;
  status: string;
  metadata: string | null;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}
export type FileCategory = "video" | "audio" | "image" | "document" | "subtitle";
export interface RegisterFileOptions {
  original_name?: string;
  category?: FileCategory;
  metadata?: Record<string, unknown>;
  user_id?: number;
}

const MIME_TYPES: Record<string, string> = {
  ".vtt": "text/vtt", ".srt": "application/x-subrip", ".ass": "text/x-ass", ".ssa": "text/x-ssa",
  ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".webm": "video/webm", ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".json": "application/json", ".xml": "application/xml",
};

function getMimeType(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] || "application/octet-stream";
}

function detectCategory(filename: string, mimeType?: string | null): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".vtt" || ext === ".srt" || ext === ".ass" || ext === ".ssa" || ext === ".sub") return "subtitle";
  if (ext === ".mp4" || ext === ".mkv" || ext === ".webm" || ext === ".avi") return "video";
  if (ext === ".mp3" || ext === ".m4a" || ext === ".aac" || ext === ".wav") return "audio";
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".gif" || ext === ".webp") return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.startsWith("image/")) return "image";
  return "document";
}

export class FileService {
  private storageBaseDir: string;

  constructor(storageBaseDir: string) {
    this.storageBaseDir = storageBaseDir;
  }

  getUploadsDir(...parts: string[]): string {
    return join(this.storageBaseDir, "uploads", ...parts);
  }

  getBaseStorageDir(): string {
    return this.storageBaseDir;
  }

  ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
  }

  getTaskExtractDir(taskId: number): string {
    const dir = join(this.storageBaseDir, "uploads", "extracted", taskId.toString());
    this.ensureDir(dir);
    return dir;
  }

  getHlsOutputDir(taskId: number): string {
    const dir = join(this.storageBaseDir, "hls", taskId.toString());
    this.ensureDir(dir);
    return dir;
  }

  getHlsTracksDir(taskId: number): string {
    const dir = join(this.getHlsOutputDir(taskId), "tracks");
    this.ensureDir(dir);
    return dir;
  }

  getThumbnailDir(taskId: number): string {
    const dir = this.getUploadsDir("thumbnails", taskId.toString());
    this.ensureDir(dir);
    return dir;
  }

  resolveThumbnailPath(taskId: number, filename: string): string {
    return join(this.getThumbnailDir(taskId), filename);
  }

  resolveExtractedPath(taskId: number, filename: string): string {
    return join(this.getUploadsDir("extracted", taskId.toString()), filename);
  }

  writeFile(filePath: string, content: string): void {
    this.ensureDir(dirname(filePath));
    writeFileSync(filePath, content);
  }

  readFile(filePath: string): string | null {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  exists(filePath: string): boolean {
    return existsSync(filePath);
  }

  resolveUploadsPath(urlPath: string): string {
    if (!urlPath) return "";
    const baseDir = this.getUploadsDir();
    if (isAbsolute(urlPath) && urlPath.startsWith(baseDir)) return urlPath;
    let cleanPath = urlPath.replace(/\\/g, "/");
    if (cleanPath.startsWith("uploads/")) cleanPath = cleanPath.replace(/^uploads\//, "");
    return join(baseDir, cleanPath);
  }

  resolveStoragePath(urlPath: string): string {
    const baseDir = this.storageBaseDir;
    if (urlPath.startsWith(baseDir)) return urlPath;
    if (urlPath.startsWith("/home/") || urlPath.startsWith(process.cwd())) return urlPath;
    if (isAbsolute(urlPath)) return urlPath;
    let cleanPath = urlPath.startsWith("/") ? urlPath.replace(/^\//, "") : urlPath.replace(/^\.\//, "");
    if (cleanPath.startsWith("storage/")) return join(baseDir, cleanPath);
    if (cleanPath.startsWith("uploads/")) return join(baseDir, "storage", cleanPath);
    return join(baseDir, cleanPath);
  }

  resolveRelativeFromStorage(absolutePath: string): string {
    const uploadsDir = this.getUploadsDir().replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(uploadsDir)) return normalized.replace(uploadsDir, "").replace(/^\//, "");
    const storageDir = this.storageBaseDir.replace(/\\/g, "/");
    if (normalized.startsWith(storageDir)) return normalized.replace(storageDir, "").replace(/^\//, "");
    if (normalized.startsWith("uploads/")) return normalized.replace(/^uploads\//, "");
    if (normalized.startsWith("storage/uploads/")) return normalized.replace(/^storage\/uploads\//, "");
    return absolutePath;
  }

  registerExistingFile(db: DrizzleDb, sourcePath: string, options: RegisterFileOptions = {}): FileRecord | { error: string } {
    if (!existsSync(sourcePath)) return { error: "File does not exist on disk" };
    const stats = statSync(sourcePath);
    const size = stats.size;
    const filename = this.resolveRelativeFromStorage(sourcePath);
    const existing = db.select().from(filesTable).where(eq(filesTable.filename, filename)).get();
    if (existing) return existing as FileRecord;
    const { getRawDb } = require("../db/index");
    const rawDb = getRawDb();
    const result = rawDb.run(
      `INSERT INTO files (filename, original_name, mime_type, size_bytes, category, metadata, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      filename, filename, getMimeType(filename), size, detectCategory(filename),
      options.metadata ? JSON.stringify(options.metadata) : null,
      options.user_id ?? null,
    );
    return db.select().from(filesTable).where(eq(filesTable.id, Number(result.lastInsertRowid))).get() as FileRecord;
  }

  copyFile(db: DrizzleDb, sourcePath: string, destDir: string, options: RegisterFileOptions = {}): FileRecord | { error: string } {
    if (!existsSync(sourcePath)) return { error: "Source file does not exist" };
    this.ensureDir(destDir);
    const ext = extname(sourcePath);
    const originalName = options.original_name || sourcePath.split("/").pop() || "";
    const destFilename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const destPath = join(destDir, destFilename);
    copyFileSync(sourcePath, destPath);
    const category = options.category || detectCategory(originalName);
    const mimeType = getMimeType(ext.toLowerCase());
    const size = statSync(destPath).size;
    const { getRawDb } = require("../db/index");
    const rawDb = getRawDb();
    const result = rawDb.run(
      `INSERT INTO files (filename, original_name, mime_type, size_bytes, category, metadata, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      destFilename, originalName, mimeType, size, category,
      options.metadata ? JSON.stringify(options.metadata) : null,
      options.user_id ?? null,
    );
    return db.select().from(filesTable).where(eq(filesTable.id, Number(result.lastInsertRowid))).get() as FileRecord;
  }

  deleteFile(db: DrizzleDb, fileId: number): { success: boolean; error?: string } {
    const fileRow = db.select().from(filesTable).where(eq(filesTable.id, fileId)).get() as FileRecord | undefined;
    if (!fileRow) return { success: false, error: "File not found" };
    const filePath = join(this.getUploadsDir(), fileRow.filename);
    try { if (existsSync(filePath)) unlinkSync(filePath); } catch (err) { console.warn(`Could not delete file ${fileId}:`, err); }
    db.delete(filesTable).where(eq(filesTable.id, fileId)).run();
    if (fileRow.user_id) {
      const { getRawDb } = require("../db/index");
      const rawDb = getRawDb();
      rawDb.run("UPDATE user_quotas SET used_bytes = MAX(0, used_bytes - ?) WHERE user_id = ?", fileRow.size_bytes, fileRow.user_id);
    }
    return { success: true };
  }

  // ========== Static methods (delegate to singleton) ==========
  static getUploadsDir(...parts: string[]): string { return gf().getUploadsDir(...parts); }
  static getBaseStorageDir(): string { return gf().getBaseStorageDir(); }
  static ensureDir(dirPath: string): void { gf().ensureDir(dirPath); }
  static getTaskExtractDir(taskId: number): string { return gf().getTaskExtractDir(taskId); }
  static getHlsOutputDir(taskId: number): string { return gf().getHlsOutputDir(taskId); }
  static getHlsTracksDir(taskId: number): string { return gf().getHlsTracksDir(taskId); }
  static getThumbnailDir(taskId: number): string { return gf().getThumbnailDir(taskId); }
  static resolveThumbnailPath(taskId: number, filename: string): string { return gf().resolveThumbnailPath(taskId, filename); }
  static resolveExtractedPath(taskId: number, filename: string): string { return gf().resolveExtractedPath(taskId, filename); }
  static writeFile(filePath: string, content: string): void { gf().writeFile(filePath, content); }
  static readFile(filePath: string): string | null { return gf().readFile(filePath); }
  static exists(filePath: string): boolean { return gf().exists(filePath); }
  static resolveUploadsPath(urlPath: string): string { return gf().resolveUploadsPath(urlPath); }
  static resolveStoragePath(urlPath: string): string { return gf().resolveStoragePath(urlPath); }
  static resolveRelativeFromStorage(absolutePath: string): string { return gf().resolveRelativeFromStorage(absolutePath); }
  static registerExistingFile(db: DrizzleDb, sourcePath: string, options?: RegisterFileOptions): FileRecord | { error: string } { return gf().registerExistingFile(db, sourcePath, options); }
  static copyFile(db: DrizzleDb, sourcePath: string, destDir: string, options?: RegisterFileOptions): FileRecord | { error: string } { return gf().copyFile(db, sourcePath, destDir, options); }
  static deleteFile(db: DrizzleDb, fileId: number): { success: boolean; error?: string } { return gf().deleteFile(db, fileId); }
  static getFilePath(filename: string, subDir?: string): string { return join(gf().getUploadsDir(), ...(subDir ? [subDir] : []), filename); }
  static fileExists(filename: string, subDir?: string): boolean { return gf().exists(join(gf().getUploadsDir(), ...(subDir ? [subDir] : []), filename)); }
  static getPublicUrl(absolutePathOrRelative: string): string {
    const relative = gf().resolveRelativeFromStorage(absolutePathOrRelative);
    return `/uploads/${relative.replace(/\\/g, "/")}`;
  }
  static resolveInternalUrl(_db: DrizzleDb, url: string): string { return url; }
  static deletePhysicalFile(filePath: string): boolean {
    if (existsSync(filePath)) { unlinkSync(filePath); return true; }
    return false;
  }
  static copyPhysicalFile(sourcePath: string, destPath: string): boolean {
    try { gf().ensureDir(dirname(destPath)); copyFileSync(sourcePath, destPath); return true; } catch { return false; }
  }
}
