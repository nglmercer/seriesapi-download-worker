import { eq, asc } from "drizzle-orm";
import { TranscodingService } from "../transcoding/transcoder";
import type { DrizzleDb } from "../../db/index";
import { mediaTasksTable } from "../../schema/queue";

export class QueueWorker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private pollMs: number;
  private running = false;
  private db: DrizzleDb;

  constructor(db: DrizzleDb, pollMs = 5000) {
    this.db = db;
    this.pollMs = pollMs;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[QueueWorker] Starting background poller (every ${this.pollMs}ms)...`);
    this.poll();
    this.interval = setInterval(() => {
      if (this.running) this.poll();
    }, this.pollMs);
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[QueueWorker] Stopped.");
    }
  }

  private poll() {
    try {
      const activeCount = TranscodingService.getProcessingCount();
      const max = TranscodingService.getMaxConcurrent();
      if (activeCount >= max) return;

      const nextTask = this.db.select().from(mediaTasksTable)
        .where(eq(mediaTasksTable.status, "ready"))
        .orderBy(asc(mediaTasksTable.created_at))
        .get();

      if (!nextTask) return;

      console.log(`[QueueWorker] Auto-starting next task: ${nextTask.id}`);
      TranscodingService.process(nextTask.id as number, null);
    } catch (err) {
      console.error("[QueueWorker] Poll error:", err);
    }
  }
}
