import { join, extname } from "path";
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync } from "fs";
import { randomUUID } from "crypto";
import type { SqliteNapiAdapter } from "../../core/index";
import { FileService } from "../file.service";
import { downloadTasksTable } from "../../schema/downloads";
import { filesTable } from "../../schema/files";
import { RqbitSessionEmitter } from "./emitter.service";
import { getEventBus } from "../queue/queue.events";
import { getMimeType, detectCategory } from "./download.utils";
import type { DownloadProgressData } from "../queue/queue.events";

export enum DownloadType {
  FILE = "file",
  MAGNET = "magnet",
  TORRENT = "torrent",
}

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  status: "pending" | "downloading" | "seeding" | "completed" | "failed" | "paused";
  type: DownloadType;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  error?: string;
  created_at: string;
  completed_at?: string;
  user_id: number;
  torrent_id?: number;
  magnet?: string;
  file_path?: string;
  file_id?: number;
}

export interface CreateDownloadOptions {
  url: string;
  filename?: string;
  category?: string;
  type?: DownloadType;
}

export class DownloadService {
  private db: SqliteNapiAdapter;
  private fileService: FileService;
  private rqbitEmitter: RqbitSessionEmitter | null = null;
  private torrentIdToTaskId = new Map<number, string>();

  constructor(db: SqliteNapiAdapter, fileService: FileService) {
    this.db = db;
    this.fileService = fileService;
  }

  static createTaskId(): string {
    return `dl_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  static detectDownloadType(url: string): DownloadType {
    if (url.startsWith("magnet:")) return DownloadType.MAGNET;
    if (url.toLowerCase().endsWith(".torrent")) return DownloadType.TORRENT;
    return DownloadType.FILE;
  }

  private async initRqbit() {
    if (this.rqbitEmitter) return;
    const baseDir = this.fileService.getUploadsDir("downloads");
    this.fileService.ensureDir(baseDir);

    this.rqbitEmitter = await RqbitSessionEmitter.create(baseDir, {
      disableDht: false,
      fastresume: true,
    });

    this.rqbitEmitter.on("progress", (id, stats, percentage) => {
      const taskId = this.torrentIdToTaskId.get(id);
      if (!taskId) return;
      const task = this.getTaskById(taskId);
      if (!task) return;

      this.db.update(downloadTasksTable).set({
        downloaded_bytes: stats.downloadedBytes,
        total_bytes: stats.totalBytes,
        progress: Math.round(percentage),
        updated_at: new Date().toISOString(),
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, Math.round(percentage), {
        status: "downloading",
        filename: stats.name,
        downloaded: stats.downloadedBytes,
        total: stats.totalBytes,
        speed: stats.downloadSpeed,
      });
    });

    this.rqbitEmitter.on("done", async (id, stats) => {
      const taskId = this.torrentIdToTaskId.get(id);
      if (!taskId) return;
      await this.handleTorrentCompletion(taskId, stats);
    });

    this.rqbitEmitter.on("error", (id, error) => {
      const taskId = this.torrentIdToTaskId.get(id);
      if (!taskId) return;
      this.handleDownloadError(taskId, error?.toString() || "Torrent error");
    });
  }

  async recoverStaleDownloads(): Promise<void> {
    const staleTasks = this.db.select(downloadTasksTable)
      .where("status = 'downloading' OR status = 'pending'").all();
    for (const task of staleTasks) {
      await this.db.update(downloadTasksTable).set({
        status: "failed",
        error: "Server restarted",
        updated_at: new Date().toISOString(),
      }).where("id = ?", [task.id]).run();
    }
    console.log(`[download] Recovered ${staleTasks.length} stale download tasks`);
  }

  async createDownload(userId: number, options: CreateDownloadOptions): Promise<{ taskId: string } | { error: string }> {
    const type = options.type || DownloadService.detectDownloadType(options.url);
    const taskId = DownloadService.createTaskId();
    const filename = options.filename || options.url.split("/").pop() || (type === DownloadType.MAGNET ? "magnet_resource" : "download");

    this.db.insert(downloadTasksTable).values({
      id: taskId,
      url: options.url,
      filename,
      status: "pending",
      type,
      progress: 0,
      downloaded_bytes: 0,
      total_bytes: 0,
      user_id: userId,
    }).run();

    if (type === DownloadType.MAGNET || type === DownloadType.TORRENT) {
      await this.initRqbit();
      this.startTorrentDownload(taskId, options.url, filename);
    } else {
      this.startHttpDownload(taskId, options.url, filename, options.category);
    }

    return { taskId };
  }

  private async startTorrentDownload(taskId: string, torrentSource: string, name: string) {
    const task = this.getTaskById(taskId);
    if (!task) return;

    this.db.update(downloadTasksTable).set({
      status: "downloading",
      updated_at: new Date().toISOString(),
    }).where("id = ?", [taskId]).run();

    try {
      if (!this.rqbitEmitter) await this.initRqbit();
      const rqbitId = await this.rqbitEmitter!.addTorrent(torrentSource, {
        outputFolder: this.fileService.getUploadsDir("downloads", task.user_id.toString()),
      });
      this.torrentIdToTaskId.set(rqbitId, taskId);

      this.db.update(downloadTasksTable).set({
        torrent_id: rqbitId,
        updated_at: new Date().toISOString(),
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, 0, {
        status: "connecting",
        filename: name,
      });
    } catch (error) {
      this.handleDownloadError(taskId, error instanceof Error ? error.message : "Torrent initialization failed");
    }
  }

  private async handleTorrentCompletion(taskId: string, stats: any) {
    const task = this.getTaskById(taskId);
    if (!task) return;

    try {
      const userDownloadDir = this.fileService.getUploadsDir("downloads", task.user_id.toString());

      const findLargestFile = (dir: string): { path: string; name: string; size: number } | null => {
        let largest: { path: string; name: string; size: number } | null = null;
        if (!existsSync(dir)) return null;
        const items = readdirSync(dir);
        for (const item of items) {
          const fullPath = join(dir, item);
          const s = statSync(fullPath);
          if (s.isDirectory()) {
            const sub = findLargestFile(fullPath);
            if (sub && (!largest || sub.size > largest.size)) largest = sub;
          } else {
            if (!largest || s.size > largest.size) largest = { path: fullPath, name: item, size: s.size };
          }
        }
        return largest;
      };

      const torrentPath = join(userDownloadDir, stats.name);
      let largestFile: { path: string; name: string; size: number } | null = null;

      if (existsSync(torrentPath)) {
        if (statSync(torrentPath).isDirectory()) {
          largestFile = findLargestFile(torrentPath);
        } else {
          largestFile = { path: torrentPath, name: stats.name, size: stats.totalBytes };
        }
      }

      if (!largestFile) largestFile = findLargestFile(userDownloadDir);
      if (!largestFile) throw new Error("Could not find downloaded files");

      const category = detectCategory(largestFile.name);
      const relativePath = this.fileService.resolveRelativeFromStorage(largestFile.path);

      const result = this.db.insert(filesTable).values({
        filename: relativePath,
        original_name: largestFile.name,
        mime_type: getMimeType(extname(largestFile.name)),
        size_bytes: largestFile.size,
        category,
        status: "valid",
        user_id: task.user_id,
      }).run();

      const now = new Date().toISOString();
      this.db.update(downloadTasksTable).set({
        status: "completed",
        progress: 100,
        completed_at: now,
        file_path: `/api/v1/uploads/${relativePath}`,
        file_id: result.lastInsertRowid,
        updated_at: now,
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, 100, {
        status: "completed",
        filename: largestFile.name,
        file_path: `/api/v1/uploads/${relativePath}`,
      });
    } catch (error) {
      this.handleDownloadError(taskId, error instanceof Error ? error.message : "Failed to finalize torrent download");
    }
  }

  private handleDownloadError(taskId: string, message: string) {
    const task = this.getTaskById(taskId);
    if (!task) return;

    this.db.update(downloadTasksTable).set({
      status: "failed",
      error: message,
      updated_at: new Date().toISOString(),
    }).where("id = ?", [taskId]).run();

    getEventBus().emitDownloadProgress(taskId, task.user_id, 0, {
      status: "failed",
      error: message,
    });
  }

  private async startHttpDownload(taskId: string, url: string, filename: string, category?: string) {
    const task = this.getTaskById(taskId);
    if (!task) return;

    this.db.update(downloadTasksTable).set({
      status: "downloading",
      updated_at: new Date().toISOString(),
    }).where("id = ?", [taskId]).run();

    getEventBus().emitDownloadProgress(taskId, task.user_id, 0, { status: "starting", filename });

    try {
      const headRes = await fetch(url, { method: "HEAD" });
      const contentLength = headRes.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      this.db.update(downloadTasksTable).set({
        total_bytes: total,
        updated_at: new Date().toISOString(),
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, 5, { status: "connecting", filename });

      const downloadResponse = await fetch(url);
      if (!downloadResponse.ok) throw new Error(`HTTP ${downloadResponse.status}`);
      if (!downloadResponse.body) throw new Error("Empty response body");

      const ext = extname(filename) || ".bin";
      const savedFilename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
      const destPath = this.fileService.getUploadsDir("downloads", task.user_id.toString());
      if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });

      const filePath = join(destPath, savedFilename);
      const fileStream = createWriteStream(filePath);
      const reader = downloadResponse.body.getReader();
      let downloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        downloaded += value.length;

        const progress = total > 0 ? Math.min(95, Math.round((downloaded / total) * 100)) : 50;
        this.db.update(downloadTasksTable).set({
          downloaded_bytes: downloaded,
          progress,
          updated_at: new Date().toISOString(),
        }).where("id = ?", [taskId]).run();

        getEventBus().emitDownloadProgress(taskId, task.user_id, progress, {
          status: "downloading", filename, downloaded, total,
        });
      }

      fileStream.end();

      const mimeType = getMimeType(ext);
      const detectedCategory = category || detectCategory(filename);
      const relativePath = join("downloads", task.user_id.toString(), savedFilename);

      const result = this.db.insert(filesTable).values({
        filename: relativePath,
        original_name: filename,
        mime_type: mimeType,
        size_bytes: downloaded,
        category: detectedCategory,
        status: "valid",
        user_id: task.user_id,
      }).run();

      const now = new Date().toISOString();
      this.db.update(downloadTasksTable).set({
        status: "completed",
        progress: 100,
        completed_at: now,
        file_path: `/api/v1/uploads/${relativePath}`,
        file_id: result.lastInsertRowid,
        updated_at: now,
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, 100, {
        status: "completed", filename, file_path: `/api/v1/uploads/${relativePath}`,
      });
    } catch (error) {
      this.handleDownloadError(taskId, error instanceof Error ? error.message : "Unknown error");
    }
  }

  getTaskById(taskId: string): DownloadTask | undefined {
    return this.db.get(downloadTasksTable, { where: "id = ?", params: [taskId] }) as DownloadTask | undefined;
  }

  getActiveTasks(): DownloadTask[] {
    return this.db.select(downloadTasksTable).orderBy("created_at", "desc").all() as DownloadTask[];
  }

  getTasksByUser(userId: number): DownloadTask[] {
    return this.db.select(downloadTasksTable).where("user_id = ?", [userId]).orderBy("created_at", "desc").all() as DownloadTask[];
  }

  cancelTask(taskId: string): boolean {
    const task = this.getTaskById(taskId);
    if (!task || task.status === "completed" || task.status === "failed") return false;

    this.db.update(downloadTasksTable).set({
      status: "failed",
      error: "Cancelled by user",
      updated_at: new Date().toISOString(),
    }).where("id = ?", [taskId]).run();

    if (task.torrent_id !== undefined && this.rqbitEmitter) {
      this.rqbitEmitter.deleteTorrent(task.torrent_id, true);
      this.torrentIdToTaskId.delete(task.torrent_id);
    }

    return true;
  }

  async pauseTask(taskId: string): Promise<boolean> {
    const task = this.getTaskById(taskId);
    if (!task || task.status !== "downloading") return false;
    if (task.torrent_id !== undefined && this.rqbitEmitter) {
      await this.rqbitEmitter.pauseTorrent(task.torrent_id);
      this.db.update(downloadTasksTable).set({
        status: "paused",
        updated_at: new Date().toISOString(),
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, task.progress, { status: "paused" });
      return true;
    }
    return false;
  }

  async resumeTask(taskId: string): Promise<boolean> {
    const task = this.getTaskById(taskId);
    if (!task || task.status !== "paused") return false;
    if (task.torrent_id !== undefined && this.rqbitEmitter) {
      await this.rqbitEmitter.startTorrent(task.torrent_id);
      this.db.update(downloadTasksTable).set({
        status: "downloading",
        updated_at: new Date().toISOString(),
      }).where("id = ?", [taskId]).run();

      getEventBus().emitDownloadProgress(taskId, task.user_id, task.progress, { status: "downloading" });
      return true;
    }
    return false;
  }

  async deleteTask(taskId: string, deleteFiles: boolean = false): Promise<boolean> {
    const task = this.getTaskById(taskId);
    if (!task) return false;

    if (task.torrent_id !== undefined && this.rqbitEmitter) {
      await this.rqbitEmitter.deleteTorrent(task.torrent_id, deleteFiles);
      this.torrentIdToTaskId.delete(task.torrent_id);
    }

    this.db.delete(downloadTasksTable).where("id = ?", [taskId]).run();
    return true;
  }
}
