import { eq, and, desc, asc, sql, count } from "drizzle-orm";
import { Database } from "bun:sqlite";
import type { DrizzleDb } from "../../db/index";
import { runRaw } from "../transcoding/compat";
import {
  mediaTasksTable,
  mediaTaskTracksTable,
  mediaHlsOutputsTable,
  mediaTable,
  imagesTable,
  QUALITY_PRESETS,
  QUALITY_CONFIGS,
} from "../../schema/queue";
import { filesTable } from "../../schema/files";
import { FFmpegCommand, type ProbeData } from "ffmpeg-lib";
import { getFFmpegPaths } from "../transcoding/ffmpeg-instance";
import { hlsResourceService } from "../transcoding/hls-service";
import { FileService } from "../file.service";
import { HlsS3Storage } from "../transcoding/compat";
import { TranscodingService } from "../transcoding/transcoder";
import { M3U8Parser } from "../transcoding/m3u8-parser";
import { join } from "path";
import { existsSync, statSync, readdirSync } from "fs";

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
    db: DrizzleDb,
    rawDb: Database,
    page: number,
    limit: number,
    offset: number,
    filters: { media_id?: number; season_id?: number; episode_id?: number } = {},
  ): TaskListResult {
    const conditions = [];
    if (filters.media_id != null) conditions.push(eq(mediaTasksTable.media_id, filters.media_id));
    if (filters.season_id != null) conditions.push(eq(mediaTasksTable.season_id, filters.season_id));
    if (filters.episode_id != null) conditions.push(eq(mediaTasksTable.episode_id, filters.episode_id));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = db.select().from(mediaTasksTable)
      .where(whereClause)
      .orderBy(desc(mediaTasksTable.created_at))
      .limit(limit)
      .offset(offset)
      .all();

    const taskIds = rows.map((t) => t.id as number);

    const allTracks =
      taskIds.length > 0
        ? db.select().from(mediaTaskTracksTable)
            .where(sql`${mediaTaskTracksTable.task_id} IN (${sql.join(taskIds.map(id => sql`${id}`), sql`, `)})`)
            .all()
        : [];

    const tracksByTask = new Map<number, typeof allTracks>();
    for (const track of allTracks) {
      const taskId = track.task_id as number;
      if (!tracksByTask.has(taskId)) {
        tracksByTask.set(taskId, []);
      }
      tracksByTask.get(taskId)!.push(track);
    }

    const processedRows = rows.map((t) => {
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

    const totalResult = db.select({ count: count() }).from(mediaTasksTable).where(whereClause).get();
    const total = totalResult?.count ?? 0;

    return { rows: processedRows, total, page, limit };
  }

  static get(
    db: DrizzleDb,
    id: number,
  ): Record<string, unknown> | null {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return null;

    const tracks = db.select().from(mediaTaskTracksTable).where(eq(mediaTaskTracksTable.task_id, id)).all();
    const outputs = db.select().from(mediaHlsOutputsTable).where(eq(mediaHlsOutputsTable.task_id, id)).all();

    const entity_type =
      task.episode_id != null
        ? "episode"
        : task.season_id != null
          ? "season"
          : "media";

    let info = task.source_video_info;
    let quals = task.qualities;
    try {
      if (typeof info === "string") info = JSON.parse(info);
    } catch {}
    try {
      if (typeof quals === "string") quals = JSON.parse(quals);
    } catch {}

    return {
      ...task,
      source_video_info: info,
      qualities: quals,
      entity_type,
      tracks,
      outputs,
    };
  }

  static create(
    db: DrizzleDb,
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
      const media = db.select().from(mediaTable).where(eq(mediaTable.id, data.media_id)).get();
      if (!media) return { error: `media_id ${data.media_id} not found` };
    }

    const resolvedUrl = FileService.resolveRelativeFromStorage(
      FileService.resolveInternalUrl(db, data.source_video_url),
    );

    const inserted = db
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
      .returning()
      .get()!;

    return this.get(db, inserted.id)!;
  }

  static async probe(
    db: DrizzleDb,
    id: number,
  ): Promise<Record<string, unknown> | { error: string }> {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    const resolvedPath = FileService.resolveInternalUrl(
      db,
      task.source_video_url as string,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source file not found: ${absolutePath}` };
    }

    db.update(mediaTasksTable).set({ status: "probing", updated_at: new Date().toISOString() })
      .where(eq(mediaTasksTable.id, id)).run();

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

      db.update(mediaTasksTable).set({
        status: "ready",
        source_video_info: JSON.stringify(info),
        qualities: JSON.stringify(suggestions),
        updated_at: new Date().toISOString(),
      }).where(eq(mediaTasksTable.id, id)).run();

      return this.get(db, id)!;
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      db.update(mediaTasksTable).set({
        status: "failed",
        error_message: errMessage,
        updated_at: new Date().toISOString(),
      }).where(eq(mediaTasksTable.id, id)).run();
      return { error: `Probe failed: ${errMessage}` };
    }
  }

  static update(
    db: DrizzleDb,
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
    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.qualities) updateData.qualities = JSON.stringify(data.qualities);
    if (data.source_video_url) {
      updateData.source_video_url = FileService.resolveRelativeFromStorage(
        FileService.resolveInternalUrl(db, data.source_video_url),
      );
    }
    if (data.thumbnail_url !== undefined) {
      updateData.thumbnail_url = data.thumbnail_url
        ? FileService.resolveRelativeFromStorage(
            FileService.resolveInternalUrl(db, data.thumbnail_url),
          )
        : null;
    }
    if (data.media_id !== undefined) updateData.media_id = data.media_id;
    if (data.season_id !== undefined) updateData.season_id = data.season_id;
    if (data.episode_id !== undefined) updateData.episode_id = data.episode_id;
    updateData.updated_at = new Date().toISOString();

    const updated = db.update(mediaTasksTable).set(updateData).where(eq(mediaTasksTable.id, id)).returning().get();

    if (!updated) return { error: "Task not found" };
    return this.get(db, id)!;
  }

  static start(
    db: DrizzleDb,
    id: number,
    userId: number | null,
  ): { error: string } | { success: true } {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    if (task.status === "processing") return { error: "Already processing" };

    db.update(mediaTasksTable).set({ status: "processing", updated_at: new Date().toISOString() })
      .where(eq(mediaTasksTable.id, id)).run();

    TranscodingService.process(id, userId, true).catch((err) => {
      console.error(`Task ${id} startup failed:`, err);
    });

    return { success: true };
  }

  static stop(db: DrizzleDb, id: number): { success: true } {
    db.update(mediaTasksTable).set({ status: "stopped", updated_at: new Date().toISOString() })
      .where(eq(mediaTasksTable.id, id)).run();

    TranscodingService.abort(id);
    return { success: true };
  }

  static restart(
    db: DrizzleDb,
    id: number,
  ): { error: string } | { success: true; status: string; message: string } {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    if (
      task.status !== "completed" &&
      task.status !== "failed" &&
      task.status !== "stopped"
    ) {
      return { error: "Can only restart completed, failed or stopped tasks" };
    }

    db.update(mediaTasksTable).set({
      status: "ready",
      progress: 0,
      updated_at: new Date().toISOString(),
    }).where(eq(mediaTasksTable.id, id)).run();

    return {
      success: true,
      status: "ready",
      message: "Task ready for re-processing",
    };
  }

  static delete(
    db: DrizzleDb,
    id: number,
  ): { error: string } | { success: true } {
    db.delete(mediaTaskTracksTable).where(eq(mediaTaskTracksTable.task_id, id)).run();
    db.delete(mediaHlsOutputsTable).where(eq(mediaHlsOutputsTable.task_id, id)).run();

    const deleted = db.delete(mediaTasksTable).where(eq(mediaTasksTable.id, id)).returning().get();

    if (!deleted) return { error: "Task not found" };
    return { success: true };
  }

  static getOutputs(
    db: DrizzleDb,
    filters: { media_id?: string; season_id?: string; episode_id?: string },
  ) {
    if (!filters.media_id && !filters.season_id && !filters.episode_id) {
      return {
        error:
          "At least one filter (media_id, season_id, or episode_id) is required",
      };
    }

    const conditions = [];
    if (filters.media_id) conditions.push(eq(mediaHlsOutputsTable.media_id, parseInt(filters.media_id, 10)));
    if (filters.season_id) conditions.push(eq(mediaHlsOutputsTable.season_id, parseInt(filters.season_id, 10)));
    if (filters.episode_id) conditions.push(eq(mediaHlsOutputsTable.episode_id, parseInt(filters.episode_id, 10)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select().from(mediaHlsOutputsTable).where(whereClause).all();
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

  static getTaskOutputs(db: DrizzleDb, id: number) {
    return db.select().from(mediaHlsOutputsTable).where(eq(mediaHlsOutputsTable.task_id, id)).all();
  }

  static getTaskOutput(
    db: DrizzleDb,
    id: number,
    outputId: number,
  ): Record<string, unknown> | { error: string } {
    const output = db.select().from(mediaHlsOutputsTable).where(eq(mediaHlsOutputsTable.id, outputId)).get();
    if (!output) return { error: "Output not found" };
    if (output.task_id !== id) return { error: "Output does not belong to this task" };

    return output;
  }

  static addQualityToTask(
    db: DrizzleDb,
    id: number,
    quality: string,
  ):
    | { error: string }
    | { success: true; quality: string; message: string; status: string } {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    const existingOutputs = db.select().from(mediaHlsOutputsTable)
      .where(eq(mediaHlsOutputsTable.task_id, id)).all();
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
      db.update(mediaTasksTable).set({
        qualities: JSON.stringify(updatedQualities),
        status: "ready",
        updated_at: new Date().toISOString(),
      }).where(eq(mediaTasksTable.id, id)).run();
    }

    return {
      success: true,
      quality,
      message: `Quality ${quality} added. Ready to transcode.`,
      status: "ready",
    };
  }

  static setQualities(
    db: DrizzleDb,
    id: number,
    qualities: string[],
  ): Record<string, unknown> | { error: string } {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    db.update(mediaTasksTable).set({
      qualities: JSON.stringify(qualities),
      status: "ready",
      updated_at: new Date().toISOString(),
    }).where(eq(mediaTasksTable.id, id)).run();

    return this.get(db, id)!;
  }

  static async processTracks(
    db: DrizzleDb,
    id: number,
  ): Promise<{ error: string } | { success: true; message: string }> {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    if (task.status !== "completed") {
      return { error: "Only completed tasks can process external tracks" };
    }

    await TranscodingService.processExternalTracks(id);
    return { success: true, message: "External tracks processed successfully" };
  }

  static async generateThumbnail(
    db: DrizzleDb,
    rawDb: Database,
    id: number,
    seekParam?: string | null,
  ): Promise<
    | { error: string }
    | { id: number; url: string; seek_time: number; task_id: number }
  > {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    const resolvedPath = FileService.resolveInternalUrl(
      db,
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

      const fileRecord = FileService.registerExistingFile(db, outputPath, {
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

  static async getOrGenerateThumbnail(
    db: DrizzleDb,
    rawDb: Database,
    entityType: "episode" | "media" | "season",
    entityId: number,
    seekParam?: string | null,
  ): Promise<
    { error: string } | { url: string; generated: boolean; file_id?: number }
  > {
    const imageType = entityType === "episode" ? "still" : "poster";
    const existing = db.select().from(imagesTable)
      .where(and(
        eq(imagesTable.entity_type, entityType),
        eq(imagesTable.entity_id, entityId),
        eq(imagesTable.image_type, imageType),
        eq(imagesTable.is_primary, 1),
      )).get();

    if (existing && existing.url) {
      return {
        url: existing.url as string,
        generated: false,
        file_id: existing.file_id as number | undefined,
      };
    }

    let task;
    if (entityType === "episode") {
      task = db.select().from(mediaTasksTable)
        .where(and(
          eq(mediaTasksTable.episode_id, entityId),
          sql`${mediaTasksTable.source_video_url} IS NOT NULL`,
        )).orderBy(desc(mediaTasksTable.id)).get();
    } else if (entityType === "season") {
      task = db.select().from(mediaTasksTable)
        .where(and(
          eq(mediaTasksTable.season_id, entityId),
          sql`${mediaTasksTable.episode_id} IS NULL`,
          sql`${mediaTasksTable.source_video_url} IS NOT NULL`,
        )).orderBy(desc(mediaTasksTable.id)).get();
    } else {
      task = db.select().from(mediaTasksTable)
        .where(and(
          eq(mediaTasksTable.media_id, entityId),
          sql`${mediaTasksTable.season_id} IS NULL`,
          sql`${mediaTasksTable.episode_id} IS NULL`,
          sql`${mediaTasksTable.source_video_url} IS NOT NULL`,
        )).orderBy(desc(mediaTasksTable.id)).get();
    }

    if (!task) {
      return {
        error: `No transcoding task found for ${entityType} ${entityId}`,
      };
    }

    const resolvedPath = FileService.resolveInternalUrl(
      db,
      task.source_video_url as string,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source video not found: ${absolutePath}` };
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

      const fileRecord = FileService.registerExistingFile(db, outputPath, {
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

      db.insert(imagesTable).values({
        entity_type: entityType,
        entity_id: entityId,
        image_type: imageType,
        url: publicUrl,
        file_id: fileId,
        is_primary: 1,
        source: "auto_generated",
      }).run();

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

  static async backfillTaskOutputs(
    db: DrizzleDb,
    rawDb: Database,
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

    const outputs = db.select().from(mediaHlsOutputsTable)
      .where(eq(mediaHlsOutputsTable.task_id, taskId)).all();

    if (outputs.length === 0) {
      return { updated: 0, errors: [] };
    }

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

        const variantInfo = variantMap.get(quality);

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
          runRaw(
            `UPDATE media_hls_outputs SET ${updates.join(", ")} WHERE id = ?`,
            ...params,
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

  static async backfillAllOutputs(
    db: DrizzleDb,
    rawDb: Database,
  ): Promise<{ totalOutputs: number; updated: number; errors: string[] }> {
    const rows = rawDb
      .query(
        `SELECT DISTINCT task_id FROM media_hls_outputs WHERE total_duration IS NULL`,
      )
      .all() as { task_id: number }[];

    let totalOutputs = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];

    for (const row of rows) {
      const result = await this.backfillTaskOutputs(db, rawDb, row.task_id);
      totalOutputs++;
      totalUpdated += result.updated;
      allErrors.push(...result.errors);
    }

    return { totalOutputs, updated: totalUpdated, errors: allErrors };
  }

  static processNext(db: DrizzleDb) {
    const activeCount = TranscodingService.getProcessingCount();
    const max = TranscodingService.getMaxConcurrent();

    if (activeCount >= max) {
      console.log(`[Queue] Concurrency limit reached (${activeCount}/${max}).`);
      return;
    }

    const nextTask = db.select().from(mediaTasksTable)
      .where(eq(mediaTasksTable.status, "ready"))
      .orderBy(asc(mediaTasksTable.created_at))
      .get();

    if (!nextTask) {
      console.log("[Queue] No tasks ready for processing.");
      return;
    }

    console.log(`[Queue] Auto-starting next task: ${nextTask.id} (${nextTask.title})`);
    this.start(db, nextTask.id as number, null);
  }
}
