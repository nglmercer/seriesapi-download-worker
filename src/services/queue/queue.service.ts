import {
  mediaTasksTable,
  mediaTaskTracksTable,
  mediaHlsOutputsTable,
  QUALITY_PRESETS,
  QUALITY_CONFIGS,
} from "../../schema/queue";
import { mediaTable } from "../../schema/queue";
import { filesTable } from "../../schema/files";
import { imagesTable } from "../../schema/queue";
import { FFmpegCommand, type ProbeData } from "ffmpeg-lib";
import { getFFmpegPaths } from "../transcoding/ffmpeg-instance";
import { hlsResourceService } from "../transcoding/hls-service";
import { FileService } from "../file.service";
import { HlsS3Storage } from "../transcoding/compat";
import { TranscodingService } from "../transcoding/transcoder";
import { M3U8Parser } from "../transcoding/m3u8-parser";
import { join } from "path";
import { existsSync, statSync, readdirSync } from "fs";
import type { SqliteNapiAdapter } from "../../core/index";
import type { Database } from "sqlite-napi";

export interface TaskListResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

export interface ProbeResult {
  width: number;
  height: number;
  duration: number;
  bitrate: number;
  codec: string;
  fps: null;
  streams: {
    index: number;
    type: string;
    codec: string;
    lang: string | undefined;
    profile: string | undefined;
    bit_rate: number | undefined;
  }[];
}

export class QueueService {
  static list(
    drizzle: SqliteNapiAdapter,
    page: number,
    limit: number,
    offset: number,
    filters: { media_id?: number; season_id?: number; episode_id?: number } = {},
  ): TaskListResult {
    const whereConditions: string[] = [];
    const whereParams: unknown[] = [];

    if (filters.media_id != null) {
      whereConditions.push("media_id = ?");
      whereParams.push(filters.media_id);
    }
    if (filters.season_id != null) {
      whereConditions.push("season_id = ?");
      whereParams.push(filters.season_id);
    }
    if (filters.episode_id != null) {
      whereConditions.push("episode_id = ?");
      whereParams.push(filters.episode_id);
    }

    const rows = drizzle.all(mediaTasksTable, {
      where: whereConditions.length > 0 ? whereConditions.join(" AND ") : undefined,
      params: whereParams,
      orderBy: "created_at desc",
      limit: limit,
      offset: offset ?? 0
    });

    const taskIds = rows.map((t: Record<string, unknown>) => t.id as number);

    const allTracks =
      taskIds.length > 0
        ? drizzle.all(mediaTaskTracksTable, {
            where: `task_id IN (${taskIds.join(",")})`
          })
        : [];

    const tracksByTask = new Map<number, typeof allTracks>();
    for (const track of allTracks) {
      const trackRecord = track as Record<string, unknown>;
      const taskId = trackRecord.task_id as number;
      if (!tracksByTask.has(taskId)) {
        tracksByTask.set(taskId, []);
      }
      tracksByTask.get(taskId)!.push(track);
    }

    const processedRows = rows.map((t: Record<string, unknown>) => {
      let info = t.source_video_info;
      let quals = t.qualities;
      try {
        if (typeof info === "string") info = JSON.parse(info);
      } catch {}
      try {
        if (typeof quals === "string") quals = JSON.parse(quals);
      } catch {}

      return {
        ...t,
        source_video_info: info,
        qualities: quals,
        entity_type:
          t.episode_id != null
            ? "episode"
            : t.season_id != null
              ? "season"
              : "media",
        tracks: tracksByTask.get(t.id as number) || [],
      };
    });

    const total = drizzle.count(mediaTasksTable, {
      where: whereConditions.length > 0 ? whereConditions.join(" AND ") : undefined,
      params: whereParams
    });

    return { rows: processedRows, total, page, limit };
  }

  static get(
    drizzle: SqliteNapiAdapter,
    id: number,
  ): Record<string, unknown> | null {
    const task = drizzle.get(mediaTasksTable, { where: "id = ?", params: [id] });
    if (!task) return null;

    const tracks = drizzle.all(mediaTaskTracksTable, { where: "task_id = ?", params: [id] });
    const outputs = drizzle.all(mediaHlsOutputsTable, { where: "task_id = ?", params: [id] });

    const taskRecord = task as Record<string, unknown>;
    const entity_type =
      taskRecord.episode_id != null
        ? "episode"
        : taskRecord.season_id != null
          ? "season"
          : "media";

    let info = taskRecord.source_video_info;
    let quals = taskRecord.qualities;
    try {
      if (typeof info === "string") info = JSON.parse(info);
    } catch {}
    try {
      if (typeof quals === "string") quals = JSON.parse(quals);
    } catch {}

    return {
      ...taskRecord,
      source_video_info: info,
      qualities: quals,
      entity_type,
      tracks,
      outputs,
    };
  }

  static create(
    drizzle: SqliteNapiAdapter,
    data: {
      title: string;
      description?: string;
      media_id?: number;
      season_id?: number;
      episode_id?: number;
      source_video_url: string;
      thumbnail_url?: string;
    },
  ): Record<string, unknown> | { error: string } {
    if (data.media_id !== undefined) {
      const media = drizzle.get(mediaTable, {
        select: "id",
        where: "id = ?",
        params: [data.media_id]
      });
      if (!media) return { error: `media_id ${data.media_id} not found` };
    }

    const resolvedUrl = FileService.resolveRelativeFromStorage(
      FileService.resolveInternalUrl(drizzle, data.source_video_url),
    );

    const result = drizzle
      .insert(mediaTasksTable)
      .values({
        title: data.title,
        description: data.description ?? undefined,
        media_id: data.media_id ?? undefined,
        season_id: data.season_id ?? undefined,
        episode_id: data.episode_id ?? undefined,
        source_video_url: resolvedUrl,
        thumbnail_url: data.thumbnail_url ?? undefined,
        status: "pending",
      })
      .run();

    return this.get(drizzle, Number(result.lastInsertRowid))!;
  }

  static async probe(
    drizzle: SqliteNapiAdapter,
    id: number,
  ): Promise<Record<string, unknown> | { error: string }> {
    const task = drizzle.get(mediaTasksTable, {
      where: "id = ?",
      params: [id]
    }) as Record<string, unknown> | undefined;
    if (!task) return { error: "Task not found" };

    const resolvedPath = FileService.resolveInternalUrl(
      drizzle,
      task.source_video_url as string,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source file not found: ${absolutePath}` };
    }

    drizzle
      .update(mediaTasksTable)
      .set({ status: "probing", updated_at: new Date().toISOString() })
      .where("id = ?", [id])
      .run();

    try {
      const { ffmpegPath, ffprobePath } = await getFFmpegPaths();
      const probeData = (await FFmpegCommand.probe(absolutePath, {
        ffmpegPath,
        ffprobePath,
      })) as ProbeData;

      const videoStream = probeData.streams.find(
        (s) => s.codec_type === "video",
      );

      const streams = probeData.streams.map((s) => ({
        index: s.index,
        type: s.codec_type,
        codec: s.codec_name,
        lang: s.tags?.language,
        profile: s.profile,
        bit_rate: s.bit_rate,
      }));

      const info: ProbeResult = {
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        duration: Math.round(probeData.format.duration ?? 0),
        bitrate: probeData.format.bit_rate ?? 0,
        codec: videoStream?.codec_name ?? "",
        fps: null,
        streams,
      };

      const h = info.height;
      const suggestions: string[] = [];
      if (h >= 1080) suggestions.push("1080p");
      if (h >= 720) suggestions.push("720p");
      if (h >= 480) suggestions.push("480p");
      if (h >= 360) suggestions.push("360p");
      if (suggestions.length === 0) suggestions.push("original");

      drizzle
        .update(mediaTasksTable)
        .set({
          status: "ready",
          source_video_info: JSON.stringify(info),
          qualities: JSON.stringify(suggestions),
          updated_at: new Date().toISOString(),
        })
        .where("id = ?", [id])
        .run();

      return this.get(drizzle, id)!;
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      drizzle
        .update(mediaTasksTable)
        .set({
          status: "failed",
          error_message: errMessage,
          updated_at: new Date().toISOString(),
        })
        .where("id = ?", [id])
        .run();
      return { error: `Probe failed: ${errMessage}` };
    }
  }

  static update(
    drizzle: SqliteNapiAdapter,
    id: number,
    data: {
      title?: string;
      description?: string;
      qualities?: string[];
      source_video_url?: string;
      thumbnail_url?: string;
      media_id?: number;
      season_id?: number;
      episode_id?: number;
    },
  ): Record<string, unknown> | { error: string } {
    const updateData: Record<string, string | string[] | Date | number | null> =
      {};
    if (data.title) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.qualities) updateData.qualities = JSON.stringify(data.qualities);
    if (data.source_video_url) {
      updateData.source_video_url = FileService.resolveRelativeFromStorage(
        FileService.resolveInternalUrl(drizzle, data.source_video_url),
      );
    }
    if (data.thumbnail_url !== undefined) {
      updateData.thumbnail_url = data.thumbnail_url
        ? FileService.resolveRelativeFromStorage(
            FileService.resolveInternalUrl(drizzle, data.thumbnail_url),
          )
        : null;
    }
    if (data.media_id !== undefined) updateData.media_id = data.media_id;
    if (data.season_id !== undefined) updateData.season_id = data.season_id;
    if (data.episode_id !== undefined) updateData.episode_id = data.episode_id;
    updateData.updated_at = new Date().toISOString();

    const result = drizzle
      .update(mediaTasksTable)
      .set(updateData)
      .where("id = ?", [id])
      .run();

    if (result.changes === 0) return { error: "Task not found" };
    return this.get(drizzle, id)!;
  }

  static start(
    drizzle: SqliteNapiAdapter,
    id: number,
    userId: number | null,
  ): { error: string } | { success: true } {
    const task = drizzle.get(mediaTasksTable, {
      where: "id = ?",
      params: [id]
    }) as Record<string, unknown> | undefined;
    if (!task) return { error: "Task not found" };

    if (task.status === "processing") return { error: "Already processing" };

    drizzle
      .update(mediaTasksTable)
      .set({ status: "processing", updated_at: new Date().toISOString() })
      .where("id = ?", [id])
      .run();

    TranscodingService.process(id, userId, true).catch((err) => {
      console.error(`Task ${id} startup failed:`, err);
    });

    return { success: true };
  }

  static stop(drizzle: SqliteNapiAdapter, id: number): { success: true } {
    drizzle
      .update(mediaTasksTable)
      .set({ status: "stopped", updated_at: new Date().toISOString() })
      .where("id = ?", [id])
      .run();

    TranscodingService.abort(id);
    return { success: true };
  }

  static restart(
    drizzle: SqliteNapiAdapter,
    id: number,
  ): { error: string } | { success: true; status: string; message: string } {
    const task = drizzle.get(mediaTasksTable, {
      where: "id = ?",
      params: [id]
    }) as Record<string, unknown> | undefined;
    if (!task) return { error: "Task not found" };

    if (
      task.status !== "completed" &&
      task.status !== "failed" &&
      task.status !== "stopped"
    ) {
      return { error: "Can only restart completed, failed or stopped tasks" };
    }

    drizzle
      .update(mediaTasksTable)
      .set({
        status: "ready",
        progress: 0,
        updated_at: new Date().toISOString(),
      })
      .where("id = ?", [id])
      .run();

    return {
      success: true,
      status: "ready",
      message: "Task ready for re-processing",
    };
  }

  static delete(
    drizzle: SqliteNapiAdapter,
    id: number,
  ): { error: string } | { success: true } {
    drizzle.delete(mediaTaskTracksTable).where("task_id = ?", [id]).run();
    drizzle.delete(mediaHlsOutputsTable).where("task_id = ?", [id]).run();

    const result = drizzle.delete(mediaTasksTable).where("id = ?", [id]).run();

    if (result.changes === 0) return { error: "Task not found" };
    return { success: true };
  }

  static getOutputs(
    drizzle: SqliteNapiAdapter,
    filters: { media_id?: string; season_id?: string; episode_id?: string },
  ) {
    if (!filters.media_id && !filters.season_id && !filters.episode_id) {
      return {
        error:
          "At least one filter (media_id, season_id, or episode_id) is required",
      };
    }

    const whereConditions: string[] = [];
    const whereParams: unknown[] = [];

    if (filters.media_id) {
      whereConditions.push("media_id = ?");
      whereParams.push(filters.media_id);
    }
    if (filters.season_id) {
      whereConditions.push("season_id = ?");
      whereParams.push(filters.season_id);
    }
    if (filters.episode_id) {
      whereConditions.push("episode_id = ?");
      whereParams.push(filters.episode_id);
    }

    return drizzle.all(mediaHlsOutputsTable, {
      where: whereConditions.length > 0 ? whereConditions.join(" AND ") : undefined,
      params: whereParams
    });
  }

  static async checkExistingOutputs(
    media_id: string,
    season_id?: string,
    episode_id?: string,
  ) {
    if (!media_id) {
      return { error: "media_id query parameter is required" };
    }

    const qualities = await hlsResourceService.getAvailableQualities(
      parseInt(media_id, 10),
      {
        seasonId: season_id ? parseInt(season_id, 10) : undefined,
        episodeId: episode_id ? parseInt(episode_id, 10) : undefined,
      },
    );

    const subtitles = await hlsResourceService.getAvailableSubtitles(
      parseInt(media_id, 10),
      {
        seasonId: season_id ? parseInt(season_id, 10) : undefined,
        episodeId: episode_id ? parseInt(episode_id, 10) : undefined,
      },
    );

    const audio = await hlsResourceService.getAvailableAudio(
      parseInt(media_id, 10),
      {
        seasonId: season_id ? parseInt(season_id, 10) : undefined,
        episodeId: episode_id ? parseInt(episode_id, 10) : undefined,
      },
    );

    return { qualities, subtitles, audio };
  }

  static getTaskOutputs(drizzle: SqliteNapiAdapter, id: number) {
    return drizzle.all(mediaHlsOutputsTable, { where: "task_id = ?", params: [id] });
  }

  static getTaskOutput(
    drizzle: SqliteNapiAdapter,
    id: number,
    outputId: number,
  ): Record<string, unknown> | { error: string } {
    const output = drizzle.get(mediaHlsOutputsTable, {
      where: "id = ?",
      params: [outputId]
    }) as Record<string, unknown> | undefined;
    if (!output) return { error: "Output not found" };
    if (output.task_id !== id)
      return { error: "Output does not belong to this task" };

    return output;
  }

  static addQualityToTask(
    drizzle: SqliteNapiAdapter,
    id: number,
    quality: string,
  ):
    | { error: string }
    | { success: true; quality: string; message: string; status: string } {
    const task = drizzle.get(mediaTasksTable, {
      where: "id = ?",
      params: [id]
    }) as Record<string, unknown> | undefined;
    if (!task) return { error: "Task not found" };

    const existingOutputs = drizzle.all(mediaHlsOutputsTable, {
      where: "task_id = ?",
      params: [id]
    }) as Record<string, unknown>[];
    const existingQualities = existingOutputs
      .map((o) => o.quality as string)
      .filter(Boolean);

    if (existingQualities.includes(quality)) {
      return { error: `Quality ${quality} already exists for this task` };
    }

    const currentQualities = task.qualities
      ? JSON.parse(task.qualities as string)
      : [];
    if (!currentQualities.includes(quality)) {
      const updatedQualities = [...currentQualities, quality];
      drizzle
        .update(mediaTasksTable)
        .set({
          qualities: JSON.stringify(updatedQualities),
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .where("id = ?", [id])
        .run();
    }

    return {
      success: true,
      quality,
      message: `Quality ${quality} added. Ready to transcode.`,
      status: "ready",
    };
  }

  static setQualities(
    drizzle: SqliteNapiAdapter,
    id: number,
    qualities: string[],
  ): Record<string, unknown> | { error: string } {
    const task = drizzle.get(mediaTasksTable, { where: "id = ?", params: [id] });
    if (!task) return { error: "Task not found" };

    drizzle
      .update(mediaTasksTable)
      .set({
        qualities: JSON.stringify(qualities),
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .where("id = ?", [id])
      .run();

    return this.get(drizzle, id)!;
  }

  static async processTracks(
    drizzle: SqliteNapiAdapter,
    id: number,
  ): Promise<{ error: string } | { success: true; message: string }> {
    const task = drizzle.get(mediaTasksTable, {
      where: "id = ?",
      params: [id]
    }) as Record<string, unknown> | undefined;
    if (!task) return { error: "Task not found" };

    if (task.status !== "completed") {
      return { error: "Only completed tasks can process external tracks" };
    }

    await TranscodingService.processExternalTracks(id);
    return { success: true, message: "External tracks processed successfully" };
  }

  static async generateThumbnail(
    drizzle: SqliteNapiAdapter,
    db: Database,
    id: number,
    seekParam?: string | null,
  ): Promise<
    | { error: string }
    | { id: number; url: string; seek_time: number; task_id: number }
  > {
    const task = drizzle.get(mediaTasksTable, {
      where: "id = ?",
      params: [id]
    }) as Record<string, unknown> | undefined;
    if (!task) return { error: "Task not found" };

    const resolvedPath = FileService.resolveInternalUrl(
      drizzle,
      task.source_video_url as string,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source file not found: ${absolutePath}` };
    }

    let duration = 0;
    try {
      const info = task.source_video_info;
      if (typeof info === "string") {
        const parsed = JSON.parse(info);
        duration = parsed.duration || 0;
      } else if (info) {
        duration = ((info as Record<string, unknown>).duration as number) || 0;
      }
    } catch {}

    let seekTime = 5;
    if (seekParam) {
      const parsed = parseFloat(seekParam);
      if (!isNaN(parsed) && parsed >= 0) {
        seekTime = parsed > duration ? 0 : parsed;
      }
    } else if (duration > 0) {
      seekTime = Math.min(5, duration * 0.1);
    }

    const thumbDir = FileService.getThumbnailDir(id);
    const outputPath = FileService.resolveThumbnailPath(
      id,
      `thumb_${Date.now()}.jpg`,
    );

    try {
      const { ffmpegPath } = await getFFmpegPaths();

      const cmd = new FFmpegCommand({ ffmpegPath })
        .input(absolutePath)
        .seek(seekTime)
        .outputOptions(["-vframes 1", "-q:v 2"])
        .output(outputPath);

      await cmd.run();

      const fileRecord = FileService.registerExistingFile(drizzle, outputPath, {
        original_name: `thumbnail_${id}.jpg`,
        category: "image",
        metadata: { task_id: id, seek_time: seekTime },
      });

      if ("error" in fileRecord) {
        return { error: fileRecord.error as string };
      }

      return {
        id: fileRecord.id as number,
        url: FileService.getPublicUrl(outputPath),
        seek_time: seekTime,
        task_id: id,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { error: `Failed to generate thumbnail: ${errMsg}` };
    }
  }

  /**
   * Get or lazily generate a thumbnail for an entity (episode, media, season).
   *
   * 1. Checks images table for existing still/poster
   * 2. If not found, finds the queue task with a source video
   * 3. Generates thumbnail via FFmpeg
   * 4. Stores in images table
   * 5. Returns the URL
   */
  static async getOrGenerateThumbnail(
    drizzle: SqliteNapiAdapter,
    db: Database,
    entityType: "episode" | "media" | "season",
    entityId: number,
    seekParam?: string | null,
  ): Promise<
    { error: string } | { url: string; generated: boolean; file_id?: number }
  > {
    // 1. Check for existing thumbnail in images table
    const imageType = entityType === "episode" ? "still" : "poster";
    const existing = drizzle.get(imagesTable, {
      where: "entity_type = ? AND entity_id = ? AND image_type = ? AND is_primary = 1",
      params: [entityType, entityId, imageType]
    }) as Record<string, unknown> | undefined;

    if (existing && existing.url) {
      return {
        url: existing.url as string,
        generated: false,
        file_id: existing.file_id as number | undefined,
      };
    }

    // 2. Find the queue task for this entity
    let taskWhere: string;
    let taskParams: unknown[];
    if (entityType === "episode") {
      taskWhere = "episode_id = ? AND source_video_url IS NOT NULL";
      taskParams = [entityId];
    } else if (entityType === "season") {
      taskWhere = "season_id = ? AND episode_id IS NULL AND source_video_url IS NOT NULL";
      taskParams = [entityId];
    } else {
      taskWhere = "media_id = ? AND season_id IS NULL AND episode_id IS NULL AND source_video_url IS NOT NULL";
      taskParams = [entityId];
    }

    const task = drizzle.get(mediaTasksTable, {
      where: taskWhere,
      params: taskParams,
      orderBy: "id DESC"
    }) as Record<string, unknown> | undefined;
    if (!task) {
      return {
        error: `No transcoding task found for ${entityType} ${entityId}`,
      };
    }

    // 3. Resolve source video path
    const resolvedPath = FileService.resolveInternalUrl(
      drizzle,
      task.source_video_url as string,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source video not found: ${absolutePath}` };
    }

    // 4. Calculate seek time
    let duration = 0;
    try {
      const info = task.source_video_info;
      if (typeof info === "string") {
        const parsed = JSON.parse(info);
        duration = parsed.duration || 0;
      } else if (info) {
        duration = ((info as Record<string, unknown>).duration as number) || 0;
      }
    } catch {}

    let seekTime = 5;
    if (seekParam) {
      const parsed = parseFloat(seekParam);
      if (!isNaN(parsed) && parsed >= 0) {
        seekTime = parsed > duration ? 0 : parsed;
      }
    } else if (duration > 0) {
      seekTime = Math.min(5, duration * 0.1);
    }

    // 5. Generate thumbnail
    const taskId = task.id as number;
    const thumbDir = FileService.getThumbnailDir(taskId);
    const outputPath = FileService.resolveThumbnailPath(
      taskId,
      `entity_${entityType}_${entityId}.jpg`,
    );

    try {
      const { ffmpegPath } = await getFFmpegPaths();

      const cmd = new FFmpegCommand({ ffmpegPath })
        .input(absolutePath)
        .seek(seekTime)
        .outputOptions(["-vframes 1", "-q:v 2"])
        .output(outputPath);

      await cmd.run();

      // 6. Register in files table
      const fileRecord = FileService.registerExistingFile(drizzle, outputPath, {
        original_name: `thumbnail_${entityType}_${entityId}.jpg`,
        category: "image",
        metadata: {
          task_id: taskId,
          entity_type: entityType,
          entity_id: entityId,
          seek_time: seekTime,
        },
      });

      if ("error" in fileRecord) {
        return { error: fileRecord.error as string };
      }

      const fileId = fileRecord.id as number;
      const publicUrl = FileService.getPublicUrl(outputPath);

      // 7. Store in images table
      drizzle
        .insert(imagesTable)
        .values({
          entity_type: entityType,
          entity_id: entityId,
          image_type: imageType,
          url: publicUrl,
          file_id: fileId,
          is_primary: 1,
          source: "auto_generated",
        })
        .run();

      return { url: publicUrl, generated: true, file_id: fileId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { error: `Failed to generate thumbnail: ${errMsg}` };
    }
  }

  static getAvailableQualities() {
    return {
      qualities: QUALITY_PRESETS,
      configs: QUALITY_CONFIGS,
    };
  }

  /**
   * Backfill metadata for a single task's HLS outputs.
   * Parses the m3u8 files on disk and updates total_duration, segments_count,
   * file_size, resolution, and bandwidth where they are NULL.
   */
  static async backfillTaskOutputs(
    drizzle: SqliteNapiAdapter,
    db: Database,
    taskId: number,
  ): Promise<{ updated: number; errors: string[] }> {
    const outputDir = FileService.getHlsOutputDir(taskId);
    const masterPath = join(outputDir, "master.m3u8");

    if (!(await HlsS3Storage.exists(masterPath))) {
      return {
        updated: 0,
        errors: [`Master playlist not found: ${masterPath}`],
      };
    }

    // Get all outputs for this task
    const outputs = drizzle
      .select(mediaHlsOutputsTable)
      .where("task_id = ?", [taskId])
      .all() as Record<string, unknown>[];

    if (outputs.length === 0) {
      return { updated: 0, errors: [] };
    }

    // Parse master to get variant info (bandwidth, resolution)
    const masterContent = await HlsS3Storage.readFile(masterPath);
    const masterParsed = masterContent
      ? M3U8Parser.parse(masterContent, masterPath)
      : null;
    const variantMap = new Map<
      string,
      { bandwidth: number; resolution: string }
    >();

    if (masterParsed?.type === "master" && masterParsed.masterInfo) {
      for (const v of masterParsed.masterInfo.variants) {
        // uri is like "1080p/index.m3u8", extract quality
        const quality = v.uri.split("/")[0] || "";
        if (!quality) continue;
        variantMap.set(quality, {
          bandwidth: v.bandwidth,
          resolution: v.resolution || `${v.width || 0}x${v.height || 0}`,
        });
      }
    }

    let updated = 0;
    const errors: string[] = [];

    for (const output of outputs) {
      const quality = output.quality as string;
      if (!quality) continue;

      const qualityDir = join(outputDir, quality);
      const playlistPath = join(qualityDir, "index.m3u8");

      if (!(await HlsS3Storage.exists(playlistPath))) {
        errors.push(`Playlist not found: ${playlistPath}`);
        continue;
      }

      try {
        // Parse variant playlist for duration and segments
        const playlistContent = await HlsS3Storage.readFile(playlistPath);
        const parsed = playlistContent
          ? M3U8Parser.parse(playlistContent, playlistPath)
          : null;
        let totalDuration = 0;
        let segmentsCount = 0;

        if (parsed?.type === "variant" && parsed.variantInfo) {
          totalDuration = parsed.variantInfo.totalDuration;
          segmentsCount = parsed.variantInfo.segments;
        }

        // Calculate directory file size (local only; S3 sizes not listed)
        let fileSize = 0;
        if (existsSync(qualityDir)) {
          const files = readdirSync(qualityDir);
          for (const file of files) {
            try {
              const stats = statSync(join(qualityDir, file));
              fileSize += stats.size;
            } catch {}
          }
        }

        // Get bandwidth/resolution from master playlist
        const variantInfo = variantMap.get(quality);

        // Build update — only set fields that are currently NULL
        const updates: string[] = [];
        const params: unknown[] = [];

        if (!output.total_duration && totalDuration > 0) {
          updates.push("total_duration = ?");
          params.push(Math.round(totalDuration * 100) / 100);
        }
        if (!output.segments_count && segmentsCount > 0) {
          updates.push("segments_count = ?");
          params.push(segmentsCount);
        }
        if (!output.file_size && fileSize > 0) {
          updates.push("file_size = ?");
          params.push(fileSize);
        }
        if (!output.resolution && variantInfo?.resolution) {
          updates.push("resolution = ?");
          params.push(variantInfo.resolution);
        }
        if (!output.bandwidth && variantInfo?.bandwidth) {
          updates.push("bandwidth = ?");
          params.push(variantInfo.bandwidth);
        }

        if (updates.length > 0) {
          params.push(output.id);
          db.run(
            `UPDATE media_hls_outputs SET ${updates.join(", ")} WHERE id = ?`,
            params,
          );
          updated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Quality ${quality}: ${msg}`);
      }
    }

    return { updated, errors };
  }

  /**
   * Backfill metadata for ALL tasks with HLS outputs missing duration.
   */
  static async backfillAllOutputs(
    drizzle: SqliteNapiAdapter,
    db: Database,
  ): Promise<{ totalOutputs: number; updated: number; errors: string[] }> {
    // Find all unique task_ids that have outputs with NULL total_duration
    const rows = db
      .query(
        `SELECT DISTINCT task_id FROM media_hls_outputs WHERE total_duration IS NULL`,
      )
      .all() as { task_id: number }[];

    let totalOutputs = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];

    for (const row of rows) {
      const result = await this.backfillTaskOutputs(drizzle, db, row.task_id);
      totalOutputs++;
      totalUpdated += result.updated;
      allErrors.push(...result.errors);
    }

    return { totalOutputs, updated: totalUpdated, errors: allErrors };
  }

  /**
   * Finds the next available 'ready' task and starts it if the concurrency limit allows.
   */
  static processNext(drizzle: SqliteNapiAdapter) {
    const activeCount = TranscodingService.getProcessingCount();
    const max = TranscodingService.getMaxConcurrent();

    if (activeCount >= max) {
      console.log(`[Queue] Concurrency limit reached (${activeCount}/${max}).`);
      return;
    }

    const nextTask = drizzle.get(mediaTasksTable, {
      where: "status = 'ready'",
      orderBy: "created_at ASC",
    }) as Record<string, unknown> | undefined;

    if (!nextTask) {
      console.log("[Queue] No tasks ready for processing.");
      return;
    }

    console.log(`[Queue] Auto-starting next task: ${nextTask.id} (${nextTask.title})`);
    this.start(drizzle, nextTask.id as number, null);
  }
}
