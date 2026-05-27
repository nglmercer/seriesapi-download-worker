import { eq, and, like } from "drizzle-orm";
import type { DrizzleDb } from "../../db/index";
import {
  mediaTasksTable,
  mediaTaskTracksTable,
  mediaCustomSubtitlesTable,
} from "../../schema/queue";
import { filesTable } from "../../schema/files";
import { FileService } from "../file.service";
import { HlsS3Storage } from "../transcoding/compat";
import { TranscodingService } from "../transcoding/transcoder";
import { FFmpegCommand, type ProbeData } from "ffmpeg-lib";
import { getFFmpegPaths } from "../transcoding/ffmpeg-instance";
import { editMasterPlaylist } from "../transcoding/m3u8-parser";

type TrackResult = {
  id: number;
  task_id: number;
  track_type: string;
  url: string;
  label: string | null;
  lang: string | null;
  is_external: number | null;
  action: string | null;
  replace_lang: string | null;
  metadata: string | null;
  created_at: string | null;
  updated_at: string | null;
  file_id?: number;
};

type ExtractedTrack = {
  id: number;
  type: string;
  url: string;
  label: string;
  lang: string;
};

function parseFileIdFromUrl(url: string): number | null {
  if (!url.includes("/files/")) return null;
  const match = url.match(/\/files\/(\d+)\/view/);
  if (match && match[1]) return parseInt(match[1], 10);
  return null;
}

export class QueueTrackService {
  static addTrack(
    db: DrizzleDb,
    taskId: number,
    data: {
      type: "audio" | "subtitle";
      file_id?: number;
      url?: string;
      label?: string;
      lang?: string;
      is_external?: boolean;
      action: string;
      replace_lang?: string;
      metadata?: Record<string, unknown>;
    },
  ): TrackResult | { error: string } {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, taskId)).get();
    if (!task) return { error: "Task not found" };

    let trackUrl = "";
    let isExternal = data.is_external ? 1 : 0;

    if (data.file_id) {
      const fileRec = db.select().from(filesTable).where(eq(filesTable.id, data.file_id)).get();
      if (!fileRec) return { error: "File not found" };
      trackUrl = `file:${fileRec.id}`;
      isExternal = 1;
    } else if (data.url) {
      const resolvedFileId = parseFileIdFromUrl(data.url);
      if (resolvedFileId) {
        const fileRec = db.select().from(filesTable).where(eq(filesTable.id, resolvedFileId)).get();
        if (fileRec) {
          trackUrl = `file:${fileRec.id}`;
          isExternal = 1;
        }
      }
      if (!trackUrl) {
        trackUrl = FileService.resolveRelativeFromStorage(data.url);
      }
    } else {
      return { error: "file_id or url is required" };
    }

    const inserted = db.insert(mediaTaskTracksTable).values({
      task_id: taskId,
      track_type: data.type,
      url: trackUrl,
      label: data.label ?? undefined,
      lang: data.lang ?? undefined,
      is_external: isExternal,
      action: data.action,
      replace_lang: data.replace_lang ?? undefined,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
    }).returning().get()!;

    const taskFull = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, taskId)).get();
    if (taskFull && taskFull.status === "completed") {
      TranscodingService.processExternalTracks(taskId).catch((err) => {
        console.error(`[Queue] Failed to auto-sync tracks for task ${taskId}:`, err);
      });
    }

    const trackResult: TrackResult = { ...inserted };

    if (data.file_id) {
      trackResult.file_id = data.file_id;
    } else if (data.url) {
      const parsedFileId = parseFileIdFromUrl(data.url);
      if (parsedFileId) {
        trackResult.file_id = parsedFileId;
      }
    }

    return trackResult;
  }

  static updateTrack(
    db: DrizzleDb,
    taskId: number,
    trackId: number,
    data: {
      type?: string;
      label?: string;
      lang?: string;
      action?: string;
      replace_lang?: string;
      is_external?: boolean;
      metadata?: Record<string, unknown>;
      file_id?: number;
      url?: string;
    },
  ): TrackResult | { error: string } {
    const existingTrack = db.select().from(mediaTaskTracksTable).where(eq(mediaTaskTracksTable.id, trackId)).get();
    if (!existingTrack) return { error: "Track not found" };

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.type !== undefined) updateData.track_type = data.type;
    if (data.label !== undefined) updateData.label = data.label;
    if (data.lang !== undefined) updateData.lang = data.lang;
    if (data.action !== undefined) updateData.action = data.action;
    if (data.replace_lang !== undefined) updateData.replace_lang = data.replace_lang;
    if (data.is_external !== undefined) updateData.is_external = data.is_external ? 1 : 0;
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);

    if (data.file_id) {
      const fileRec = db.select().from(filesTable).where(eq(filesTable.id, data.file_id)).get();
      if (!fileRec) return { error: "File not found" };
      updateData.url = `file:${fileRec.id}`;
      updateData.is_external = 1;
    } else if (data.url !== undefined) {
      const resolvedFileId = parseFileIdFromUrl(data.url);
      if (resolvedFileId) {
        const fileRec = db.select().from(filesTable).where(eq(filesTable.id, resolvedFileId)).get();
        if (fileRec) {
          updateData.url = `file:${fileRec.id}`;
          updateData.is_external = 1;
        }
      }
      if (!updateData.url) {
        updateData.url = FileService.resolveRelativeFromStorage(data.url);
      }
    }

    const updated = db.update(mediaTaskTracksTable).set(updateData)
      .where(and(eq(mediaTaskTracksTable.id, trackId), eq(mediaTaskTracksTable.task_id, taskId)))
      .returning().get();

    if (!updated) return { error: "Track not found" };

    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, taskId)).get();
    if (task && task.status === "completed") {
      TranscodingService.processExternalTracks(taskId).catch((err) => {
        console.error(`[Queue] Failed to auto-sync tracks for task ${taskId}:`, err);
      });
    }

    const trackResult: TrackResult = {
      ...db.select().from(mediaTaskTracksTable).where(eq(mediaTaskTracksTable.id, trackId)).get()!,
    };

    if (trackResult.url && trackResult.url.startsWith("file:")) {
      trackResult.file_id = parseInt(trackResult.url.replace("file:", ""), 10);
    }

    return trackResult;
  }

  static async removeTrack(
    db: DrizzleDb,
    taskId: number,
    trackId: number,
  ): Promise<{ error: string } | { success: true }> {
    const track = db.select().from(mediaTaskTracksTable)
      .where(and(eq(mediaTaskTracksTable.id, trackId), eq(mediaTaskTracksTable.task_id, taskId)))
      .get();
    if (!track) return { error: "Track not found" };

    try {
      const outputDir = FileService.getHlsOutputDir(taskId);
      const masterPlaylistPath = `${outputDir}/master.m3u8`;

      if (await HlsS3Storage.exists(masterPlaylistPath)) {
        const masterContent = await HlsS3Storage.readFile(masterPlaylistPath);
        if (masterContent) {
          const trackIdPrefix =
            track.track_type === "subtitle"
              ? `subtitle_${track.id}_`
              : `audio_${track.id}_`;

          const editResult = editMasterPlaylist(masterContent, {
            removeMediaByUri: [trackIdPrefix],
          });

          if (editResult.success) {
            await HlsS3Storage.writeFile(
              masterPlaylistPath,
              editResult.content,
            );
          }
        }
      }

      const tracksDir = FileService.getHlsTracksDir(taskId);
      if (track.track_type === "subtitle") {
        const destFilename = `subtitle_${track.id}_${track.lang || "und"}.vtt`;
        const subPlaylistName = `subtitle_${track.id}_${track.lang || "und"}.m3u8`;

        await HlsS3Storage.deleteFile(`${tracksDir}/${destFilename}`);
        await HlsS3Storage.deleteFile(`${outputDir}/${subPlaylistName}`);

        db.delete(filesTable).where(eq(filesTable.filename, destFilename)).run();
        db.delete(mediaCustomSubtitlesTable).where(eq(mediaCustomSubtitlesTable.track_id, track.id)).run();
      } else {
        const destFilename = `audio_${track.id}_${track.lang || "und"}.m4a`;
        await HlsS3Storage.deleteFile(`${tracksDir}/${destFilename}`);

        db.delete(filesTable).where(eq(filesTable.filename, destFilename)).run();
      }
    } catch (err) {
      console.error(`Failed to cleanup assets for track ${trackId}:`, err);
    }

    const deleted = db.delete(mediaTaskTracksTable)
      .where(and(eq(mediaTaskTracksTable.id, trackId), eq(mediaTaskTracksTable.task_id, taskId)))
      .returning().get();

    if (!deleted) return { error: "Track not found" };
    return { success: true };
  }

  static async extractTracks(
    db: DrizzleDb,
    id: number,
  ): Promise<ExtractedTrack[] | { error: string }> {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    const resolvedPath = FileService.resolveRelativeFromStorage(
      task.source_video_url,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source file not found: ${absolutePath}` };
    }

    const { ffmpegPath, ffprobePath } = await getFFmpegPaths();
    const probeData = (await FFmpegCommand.probe(absolutePath, {
      ffmpegPath,
      ffprobePath,
    })) as ProbeData;

    const subtitleStreams = probeData.streams.filter(
      (s) => s.codec_type === "subtitle",
    );

    const results: ExtractedTrack[] = [];

    for (const s of subtitleStreams) {
      const index = s.index;
      const codec = s.codec_name;
      const lang = s.tags?.language || "und";
      const label = s.tags?.title || `Subtitle ${index} (${codec})`;

      let ext = "srt";
      if (codec === "ass" || codec === "ssa") ext = "ass";
      if (codec === "mov_text") ext = "vtt";

      const filename = `sub_${index}.${ext}`;
      const outputPath = FileService.resolveExtractedPath(id, filename);

      try {
        const existingTrack = db.select().from(mediaTaskTracksTable)
          .where(and(
            eq(mediaTaskTracksTable.task_id, id),
            like(mediaTaskTracksTable.url, `%${filename}%`),
          )).get();
        if (existingTrack) {
          results.push({
            id: Number(existingTrack.id),
            type: "subtitle",
            url: existingTrack.url,
            label: existingTrack.label ?? "",
            lang: existingTrack.lang ?? "",
          });
          continue;
        }

        const cmd = new FFmpegCommand({ ffmpegPath, ffprobePath })
          .input(absolutePath)
          .outputOptions([`-map 0:${index}`])
          .output(outputPath);

        await cmd.run();

        let rawContent = FileService.readFile(outputPath);
        if (
          !rawContent ||
          rawContent.trim().length === 0 ||
          (ext === "vtt" && rawContent.trim() === "WEBVTT")
        ) {
          FileService.deletePhysicalFile(outputPath);
          continue;
        }

        FileService.registerExistingFile(db, outputPath, {
          original_name: `${label}.${ext}`,
          category: "subtitle",
          metadata: { task_id: id, original_codec: codec, format: ext },
        });

        let finalUrl = FileService.getPublicUrl(outputPath);

        if (ext !== "vtt") {
          const vttFfmpegName = `sub_${index}_ffmpeg.vtt`;
          const vttFfmpegPath = FileService.resolveExtractedPath(
            id,
            vttFfmpegName,
          );

          try {
            const cmdVtt = new FFmpegCommand({ ffmpegPath, ffprobePath })
              .input(absolutePath)
              .outputOptions([
                `-map 0:${index}`,
                "-f webvtt",
                "-map_metadata -1",
              ])
              .output(vttFfmpegPath);
            await cmdVtt.run();

            let rawVtt = FileService.readFile(vttFfmpegPath);
            if (
              rawVtt &&
              rawVtt.trim().length > 0 &&
              rawVtt.trim() !== "WEBVTT"
            ) {
              FileService.registerExistingFile(db, vttFfmpegPath, {
                original_name: `${label}_ffmpeg.vtt`,
                category: "subtitle",
                metadata: { task_id: id, original_codec: codec, format: "vtt" },
              });
              finalUrl = FileService.getPublicUrl(vttFfmpegPath);
            } else {
              FileService.deletePhysicalFile(vttFfmpegPath);
            }
          } catch (e) {
            console.warn(
              `[Queue] Failed to extract native VTT for track ${index}`,
              e,
            );
          }
        }

        const inserted = db.insert(mediaTaskTracksTable).values({
          task_id: id,
          track_type: "subtitle",
          url: finalUrl,
          label,
          lang,
          is_external: 0,
          action: "add",
          metadata: JSON.stringify({
            original_codec: codec,
            original_ext: ext,
          }),
        }).returning().get()!;

        if (ext !== "vtt" && rawContent && rawContent.trim().length > 0) {
          db.insert(mediaCustomSubtitlesTable).values({
            task_id: id,
            track_id: inserted.id,
            format: ext,
            content: rawContent,
            lang,
            label,
          }).run();
          console.log(
            `[Queue] Registered custom subtitle ${index} (${ext}) for API serving`,
          );
        }

        results.push({
          id: inserted.id,
          type: "subtitle",
          url: finalUrl,
          label,
          lang,
        });
      } catch (err) {
        console.error(
          `[Queue] Failed to extract subtitle track ${index}:`,
          err,
        );
      }
    }

    return results;
  }

  static async extractAudioTracks(
    db: DrizzleDb,
    id: number,
  ): Promise<ExtractedTrack[] | { error: string }> {
    const task = db.select().from(mediaTasksTable).where(eq(mediaTasksTable.id, id)).get();
    if (!task) return { error: "Task not found" };

    const resolvedPath = FileService.resolveRelativeFromStorage(
      task.source_video_url,
    );
    const absolutePath = FileService.resolveUploadsPath(resolvedPath);

    if (!FileService.exists(absolutePath)) {
      return { error: `Source file not found: ${absolutePath}` };
    }

    const { ffmpegPath, ffprobePath } = await getFFmpegPaths();
    const probeData = (await FFmpegCommand.probe(absolutePath, {
      ffmpegPath,
      ffprobePath,
    })) as ProbeData;

    const audioStreams = probeData.streams.filter(
      (s) => s.codec_type === "audio",
    );

    const results: ExtractedTrack[] = [];

    for (const s of audioStreams) {
      const index = s.index;
      const codec = s.codec_name;
      const lang = s.tags?.language || "und";
      const label = s.tags?.title || `Audio ${index} (${codec})`;

      const filename = `audio_${index}.m4a`;
      const outputPath = FileService.resolveExtractedPath(id, filename);

      try {
        const cmd = new FFmpegCommand({ ffmpegPath, ffprobePath })
          .input(absolutePath)
          .audioCodec("copy")
          .outputOptions([`-map 0:${index}`])
          .output(outputPath);

        await cmd.run();

        const url = FileService.getPublicUrl(outputPath);

        const inserted = db.insert(mediaTaskTracksTable).values({
          task_id: id,
          track_type: "audio",
          url,
          label,
          lang,
          is_external: 0,
          action: "add",
          metadata: JSON.stringify({ original_codec: codec }),
        }).returning().get()!;

        results.push({
          id: inserted.id,
          type: "audio",
          url,
          label,
          lang,
        });
      } catch (err) {
        console.error(`[Queue] Failed to extract audio track ${index}:`, err);
      }
    }

    return results;
  }
}
