import { EventEmitter } from "events";
import { RqbitSession } from "rqbit-napi";
import type { RqbitAddTorrentOptions, RqbitSessionOptions, TorrentStats } from "rqbit-napi";

export type TorrentEvent = "start" | "progress" | "done" | "error";

export interface RqbitSessionEmitterEvents {
  start: (id: number, stats: TorrentStats | null) => void;
  progress: (id: number, stats: TorrentStats, percentage: number) => void;
  done: (id: number, stats: TorrentStats) => void;
  error: (id: number, error: any) => void;
}

export declare interface RqbitSessionEmitter {
  on<U extends keyof RqbitSessionEmitterEvents>(event: U, listener: RqbitSessionEmitterEvents[U]): this;
  emit<U extends keyof RqbitSessionEmitterEvents>(event: U, ...args: Parameters<RqbitSessionEmitterEvents[U]>): boolean;
}

export class RqbitSessionEmitter extends EventEmitter {
  private session: RqbitSession;
  private pollingInterval: ReturnType<typeof setInterval>;
  private activeTorrents: Set<number> = new Set();
  private previousProgress: Map<number, number> = new Map();

  private constructor(session: RqbitSession, pollIntervalMs: number = 1000) {
    super();
    this.session = session;
    this.pollingInterval = setInterval(() => this.poll(), pollIntervalMs);
  }

  static async create(downloadPath: string, options?: RqbitSessionOptions, pollIntervalMs?: number): Promise<RqbitSessionEmitter> {
    const session = await RqbitSession.create(downloadPath, options);
    return new RqbitSessionEmitter(session, pollIntervalMs);
  }

  getRawSession(): RqbitSession {
    return this.session;
  }

  async addTorrent(url: string, options?: RqbitAddTorrentOptions): Promise<number> {
    const id = await this.session.addTorrent(url, options);
    this.activeTorrents.add(id);
    const stats = await this.session.getTorrentStats(id);
    this.emit("start", id, stats);
    return id;
  }

  async pauseTorrent(id: number): Promise<boolean> {
    return this.session.pauseTorrent(id);
  }

  async startTorrent(id: number): Promise<boolean> {
    return this.session.startTorrent(id);
  }

  async deleteTorrent(id: number, deleteFiles: boolean): Promise<boolean> {
    const ok = await this.session.deleteTorrent(id, deleteFiles);
    if (ok) {
      this.activeTorrents.delete(id);
      this.previousProgress.delete(id);
    }
    return ok;
  }

  async stop() {
    clearInterval(this.pollingInterval);
    await this.session.stop();
  }

  private async poll() {
    for (const id of Array.from(this.activeTorrents)) {
      try {
        const stats = await this.session.getTorrentStats(id);
        if (!stats) continue;
        if (stats.finished) {
          this.emit("done", id, stats);
          this.activeTorrents.delete(id);
          this.previousProgress.delete(id);
        } else {
          const percentage = stats.totalBytes > 0 ? (stats.downloadedBytes / stats.totalBytes) * 100 : 0;
          const prev = this.previousProgress.get(id) || -1;
          if (percentage !== prev || stats.downloadSpeed > 0 || stats.uploadSpeed > 0) {
            this.emit("progress", id, stats, percentage);
            this.previousProgress.set(id, percentage);
          }
        }
      } catch (error) {
        this.emit("error", id, error);
      }
    }
  }
}
