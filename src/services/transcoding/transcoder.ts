import { FFmpegCommand, type ProbeData } from "ffmpeg-lib";
import { getFFmpegPaths } from "./ffmpeg-instance";
import { mediaHlsOutputsTable, mediaTasksTable } from "../../schema/queue";
import { join } from "path";
import type { MediaTask, CommandsMap, Logger } from "./types";
import {
  getTargetHeight,
  getBitrateForHeight,
  processQuality,
  processQualityOriginal,
} from "./quality-processor";
import { extractSubtitlesToVTT } from "./subtitle-extractor";
import { processExternalTracks } from "./external-tracks";
import { extractOutputMetadata } from "./metadata";
import { eq, type SqliteNapiAdapter } from "../../core/index";
import { FileService } from "../file.service";
import type { CompositeStorageBackend } from "../storage/composite-backend";
import { getEventBus } from "../queue/queue.events";

export class TranscodingService {
  static readonly events = getEventBus();

  private static commands: CommandsMap = new Map<number, FFmpegCommand>();
  private static processingTasks = new Set<number>();

  private static maxConcurrent = parseInt(process.env.MAX_CONCURRENT_TRANSCODES || "1", 10);

  private static db: SqliteNapiAdapter | null = null;
  private static fileService: FileService | null = null;
  private static storage: CompositeStorageBackend | null = null;

  private static logger: Logger = {
    info: (...msg: any[]) => console.log("[Transcoder]", ...msg),
    warn: (...msg: any[]) => console.warn("[Transcoder]", ...msg),
    error: (...msg: any[]) => console.error("[Transcoder]", ...msg),
  };

  static initialize(db: SqliteNapiAdapter, fileService: FileService, storage: CompositeStorageBackend) {
    this.db = db;
    this.fileService = fileService;
    this.storage = storage;
  }

  static async process(
    taskId: number,
    userId: number | null = null,
    extractSubtitles: boolean = true,
  ) {
    if (!this.db || !this.fileService || !this.storage) {
      throw new Error("TranscodingService not initialized. Call initialize() first.");
    }

    if (this.processingTasks.has(taskId)) {
      if (this.commands.has(taskId)) {
        this.logger.warn(`Task ${taskId} is already being processed, ignoring start request`);
        return;
      }
      this.logger.warn(`Task ${taskId} found stale in processingTasks, cleaning up`);
      this.processingTasks.delete(taskId);
    }

    if (this.processingTasks.size >= this.maxConcurrent) {
      this.logger.warn(`Task ${taskId} queued: Concurrency limit (${this.maxConcurrent}) reached. Reverting to pending.`);
      (this.db as SqliteNapiAdapter)
        .update(mediaTasksTable)
        .set({ status: "pending", updated_at: new Date().toISOString() })
        .where(eq(mediaTasksTable.columnMap.id, taskId))
        .run();
      return;
    }

    const task = (this.db as SqliteNapiAdapter)
      .select(mediaTasksTable)
      .where("id = ?", [taskId])
      .get() as MediaTask | undefined;

    if (!task) {
      this.logger.error(`Task ${taskId} not found`);
      return;
    }

    this.processingTasks.add(taskId);

    let selectedQualities: string[] = ["1080p"];
    try {
      if (task.qualities) selectedQualities = JSON.parse(task.qualities);
    } catch (e) {
      this.logger.warn(`Failed to parse qualities for task ${taskId}, using default 1080p`);
    }

    const outputDir = this.fileService!.getHlsOutputDir(taskId);

    const existingOutputs = (this.db as SqliteNapiAdapter)
      .select(mediaHlsOutputsTable)
      .where("task_id = ?", [taskId])
      .all() as { quality: string }[];

    const existingQualities = new Set(existingOutputs.map((o) => o.quality));
    const newQualities = selectedQualities.filter((q) => !existingQualities.has(q));

    if (newQualities.length === 0 && existingQualities.size > 0) {
      this.logger.info(`Task ${taskId}: All qualities already processed, updating master playlist only`);
    }

    try {
      let videoUrl = task.source_video_url;
      if (!videoUrl) throw new Error("No source video URL found");

      const absolutePath = this.fileService!.resolveUploadsPath(videoUrl);

      if (!this.fileService!.exists(absolutePath)) {
        throw new Error(`Source file not found: ${absolutePath}`);
      }
      videoUrl = absolutePath;

      const { ffmpegPath, ffprobePath } = await getFFmpegPaths();

      const probeData = (await FFmpegCommand.probe(videoUrl, {
        ffmpegPath,
        ffprobePath,
      })) as ProbeData;

      const videoStream = probeData.streams.find((s) => s.codec_type === "video");
      if (!videoStream) throw new Error("No video stream found in source");

      const sourceWidth = videoStream.width ?? 0;
      const sourceHeight = videoStream.height ?? 0;

      if (sourceWidth === 0 || sourceHeight === 0) {
        throw new Error(`Invalid source dimensions: ${sourceWidth}x${sourceHeight}`);
      }

      this.logger.info(`Task ${taskId}: Source video is ${sourceWidth}x${sourceHeight}`);

      const totalSteps = newQualities.length;
      let currentStep = 0;
      let lastEmittedProgress = -1;
      let lastEmitTime = 0;
      const EMIT_THROTTLE_MS = 500;

      const emitOverallProgress = (commandPct: number, currentQuality: string) => {
        const overallProgress = totalSteps > 0
          ? Math.round((currentStep * 100 + commandPct) / totalSteps)
          : 100;

        if (overallProgress < lastEmittedProgress) return;

        const now = Date.now();
        const isFinal = commandPct >= 100 || overallProgress >= 100;
        if (!isFinal && now - lastEmitTime < EMIT_THROTTLE_MS) return;

        lastEmittedProgress = overallProgress;
        lastEmitTime = now;

        getEventBus().emitTranscodeProgress({
          taskId,
          userId,
          progress: overallProgress,
          status: "processing",
          quality: currentQuality,
          step: currentStep + 1,
          totalSteps,
          media_id: task.media_id,
          season_id: task.season_id,
          episode_id: task.episode_id,
        });

        if (commandPct === 0 || commandPct >= 100 || Math.random() > 0.9) {
          (this.db as SqliteNapiAdapter).run(
            "UPDATE media_tasks SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [overallProgress, taskId],
          );
        }
      };

      let subtitleStreams: typeof probeData.streams = [];
      if (extractSubtitles) {
        subtitleStreams = probeData.streams.filter((s) => s.codec_type === "subtitle");
        if (subtitleStreams.length > 0) {
          this.logger.info(`Task ${taskId}: Found ${subtitleStreams.length} subtitle stream(s), extracting to VTT...`);
          await extractSubtitlesToVTT(taskId, videoUrl, subtitleStreams, ffmpegPath, ffprobePath, this.logger);
        }
      }

      const masterPlaylistPath = join(outputDir, "master.m3u8");
      const masterPlaylist = ["#EXTM3U", "#EXT-X-VERSION:3"];

      const subtitlesAttr = subtitleStreams.length > 0 ? ',SUBTITLES="subs"' : "";

      for (const quality of newQualities) {
        const isOriginal = quality === "original";

        let targetWidth: number;
        let targetHeight: number;

        if (isOriginal) {
          targetWidth = sourceWidth;
          targetHeight = sourceHeight;
        } else {
          targetHeight = getTargetHeight(quality, sourceHeight);
          targetWidth = Math.round((sourceWidth * targetHeight) / sourceHeight);
          if (targetWidth % 2 !== 0) targetWidth -= 1;
        }

        const qualityDir = join(outputDir, quality);
        this.fileService!.ensureDir(qualityDir);

        this.logger.info(`Task ${taskId}: Processing ${quality} (${targetWidth}x${targetHeight})`);

        if (isOriginal) {
          await processQualityOriginal(videoUrl, qualityDir, taskId, ffmpegPath, ffprobePath, this.commands, this.logger, (p) => emitOverallProgress(p, quality));
        } else {
          await processQuality(videoUrl, qualityDir, targetWidth, targetHeight, taskId, ffmpegPath, ffprobePath, this.commands, this.logger, (p) => emitOverallProgress(p, quality));
        }

        currentStep++;

        const bandwidth = getBitrateForHeight(targetHeight);
        masterPlaylist.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${targetWidth}x${targetHeight}${subtitlesAttr}`);
        masterPlaylist.push(`${quality}/index.m3u8`);

        (this.db as SqliteNapiAdapter)
          .insert(mediaHlsOutputsTable)
          .values({
            task_id: taskId,
            media_id: task.media_id,
            season_id: task.season_id ?? undefined,
            episode_id: task.episode_id ?? undefined,
            m3u8_url: `/hls/${taskId}/master.m3u8`,
            quality,
            resolution: `${targetWidth}x${targetHeight}`,
            bandwidth,
          })
          .run();
      }

      for (const quality of selectedQualities) {
        if (existingQualities.has(quality)) {
          const qualityDir = join(outputDir, quality);
          const playlistPath = join(qualityDir, "index.m3u8");

          if (this.fileService!.exists(playlistPath)) {
            const targetHeight = quality === "original" ? sourceHeight : getTargetHeight(quality, sourceHeight);
            let targetWidth = Math.round((sourceWidth * targetHeight) / sourceHeight);
            if (targetWidth % 2 !== 0) targetWidth -= 1;

            const bandwidth = getBitrateForHeight(targetHeight);
            masterPlaylist.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${targetWidth}x${targetHeight}${subtitlesAttr}`);
            masterPlaylist.push(`${quality}/index.m3u8`);
          }
        }
      }

      await this.storage!.writeFile(masterPlaylistPath, masterPlaylist.join("\n"));

      await processExternalTracks(taskId, this.logger);

      await extractOutputMetadata(taskId, outputDir, selectedQualities, this.logger);

      await this.storage!.uploadDir(outputDir, `hls/${taskId}`);

      (this.db as SqliteNapiAdapter).run(
        "UPDATE media_tasks SET status = 'completed', progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [taskId],
      );

      getEventBus().emitTranscodeProgress({
        taskId,
        userId,
        progress: 100,
        status: "completed",
        media_id: task.media_id,
        season_id: task.season_id,
        episode_id: task.episode_id,
      });

      getEventBus().emitHlsReady({
        taskId,
        status: "completed",
        media_id: task.media_id ?? undefined,
        season_id: task.season_id ?? undefined,
        episode_id: task.episode_id ?? undefined,
      });

      this.logger.info(`Task ${taskId} completed successfully (${newQualities.length} new, ${existingQualities.size} existing)`);
    } catch (err) {
      this.logger.error(`Task ${taskId} failed:`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      const currentTask = ((this.db as SqliteNapiAdapter).select(mediaTasksTable).where("id = ?", [taskId]).get()) as { status: string } | undefined;

      if (currentTask?.status === "stopped") {
        this.logger.info(`Task ${taskId} was manually stopped, skipping failure status update.`);
      } else {
        (this.db as SqliteNapiAdapter).run(
          "UPDATE media_tasks SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [errorMessage, taskId],
        );
      }

      getEventBus().emitTranscodeProgress({
        taskId,
        userId,
        progress: 0,
        status: "failed",
        error: errorMessage,
        media_id: task.media_id,
        season_id: task.season_id,
        episode_id: task.episode_id,
      });
    } finally {
      this.commands.delete(taskId);
      this.processingTasks.delete(taskId);
    }
  }

  static async processExternalTracks(taskId: number) {
    return processExternalTracks(taskId, this.logger);
  }

  static getProcessingCount() {
    return this.processingTasks.size;
  }

  static getMaxConcurrent() {
    return this.maxConcurrent;
  }

  static stopAll() {
    for (const taskId of Array.from(this.commands.keys())) {
      this.abort(taskId);
    }
    this.logger.info(`Stopped ${Array.from(this.commands.keys()).length} active transcoding task(s).`);
  }

  static abort(taskId: number) {
    const cmd = this.commands.get(taskId);
    if (cmd) {
      cmd.kill("SIGKILL");
      this.commands.delete(taskId);
      this.logger.info(`Task ${taskId} stopped by user`);
    }
    if (this.processingTasks.has(taskId)) {
      this.processingTasks.delete(taskId);
    }
  }

  static resetStaleTasks() {
    if (!this.db) return;
    try {
      const staleTasks = (this.db as SqliteNapiAdapter)
        .queryRaw<{ id: number }>("SELECT id FROM media_tasks WHERE status = 'processing'")
        .all();
      if (staleTasks.length === 0) return;

      this.logger.warn(`Found ${staleTasks.length} task(s) with stale 'processing' status after restart, resetting to 'stopped'`);
      for (const { id } of staleTasks) {
        this.processingTasks.delete(id);
        this.commands.delete(id);
        (this.db as SqliteNapiAdapter).run(
          "UPDATE media_tasks SET status = 'stopped', error_message = 'Server restarted — resume to continue', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [id],
        );
      }
    } catch (err) {
      this.logger.error("Failed to reset stale tasks:", err);
    }
  }
}
// Static config
let gMainApiUrl: string = "";
let gSharedApiKey: string = "";

export function setWorkerConfig(mainApiUrl: string, sharedApiKey: string) {
  gMainApiUrl = mainApiUrl;
  gSharedApiKey = sharedApiKey;
}

async function notifyMainApiHlsReady(data: { taskId: number; status: string; media_id?: number; season_id?: number; episode_id?: number }) {
  if (!gMainApiUrl) return;
  try {
    await fetch(`${gMainApiUrl}/api/v1/webhooks/hls-ready`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gSharedApiKey}`,
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.warn("[worker] Failed to notify main API of HLS ready:", err);
  }
}
