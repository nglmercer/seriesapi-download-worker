import { join, basename } from "path";
import { existsSync, readdirSync } from "fs";
import { getDb, getRawDb, drizzle as globalDrizzle } from "./compat";
import { eq, and } from "drizzle-orm";
import {
  mediaTaskTracksTable,
  mediaCustomSubtitlesTable,
} from "../../schema/queue";
import { filesTable } from "../../schema/files";
import { FileService } from "../file.service";
import { HlsS3Storage } from "./compat";
import {
  M3U8Parser,
  editMasterPlaylist,
  buildSubtitlePlaylist,
} from "./m3u8-parser";
import type { M3U8Media } from "./m3u8-parser";
import type { MediaTask, MediaTrack, Logger } from "./types";

export async function processExternalTracks(taskId: number, logger: Logger) {
  const db = getDb();
  const rawDb = getRawDb();
  const task = rawDb.query("SELECT * FROM media_tasks WHERE id = ?").get(taskId) as MediaTask | undefined;
  if (!task) {
    logger.error(`Task ${taskId} not found`);
    return;
  }

  const outputDir = FileService.getHlsOutputDir(taskId);
  const masterPlaylistPath = join(outputDir, "master.m3u8");

  if (!(await HlsS3Storage.exists(masterPlaylistPath))) {
    logger.error(`Task ${taskId}: Master playlist not found`);
    return;
  }

  const tracks = db.select().from(mediaTaskTracksTable)
    .where(and(
      eq(mediaTaskTracksTable.task_id, taskId),
      eq(mediaTaskTracksTable.action, "add"),
    ))
    .all() as MediaTrack[];

  if (tracks.length === 0) {
    logger.info(`Task ${taskId}: No external tracks to process`);
    return;
  }

  const tracksDir = FileService.getHlsTracksDir(taskId);

  const customTrackIds = new Set<number>();

  for (const track of tracks) {
    if (!track.url) continue;

    let sourcePath: string | null = null;

    if (track.url.startsWith("file:")) {
      const fileId = parseInt(track.url.replace("file:", ""), 10);
      const fileRecord = db.select().from(filesTable).where(eq(filesTable.id, fileId)).get() as { filename: string; metadata?: string } | undefined;
      if (fileRecord) {
        sourcePath = FileService.getFilePath(fileRecord.filename);

        if (!FileService.exists(sourcePath)) {
          const parsedMeta = fileRecord.metadata
            ? JSON.parse(fileRecord.metadata)
            : {};
          if (parsedMeta.task_id) {
            sourcePath = FileService.resolveExtractedPath(
              parsedMeta.task_id as number,
              fileRecord.filename,
            );
          }
        }
      }
    } else {
      const urlFilename = track.url.split("/").pop();

      if (track.is_external === 1 && urlFilename) {
        let fileRecord = db.select().from(filesTable)
          .where(eq(filesTable.filename, urlFilename))
          .get() as { filename: string; metadata?: string } | undefined;

        if (!fileRecord) {
          fileRecord = db.select().from(filesTable)
            .where(eq(filesTable.original_name, urlFilename))
            .get() as { filename: string; metadata?: string } | undefined;
        }

        if (fileRecord) {
          sourcePath = FileService.getFilePath(fileRecord.filename);

          if (!FileService.exists(sourcePath)) {
            sourcePath = FileService.resolveExtractedPath(
              taskId,
              fileRecord.filename,
            );
          }

          if (!sourcePath || !FileService.exists(sourcePath)) {
            const parsedMeta = fileRecord.metadata
              ? JSON.parse(fileRecord.metadata)
              : {};
            if (parsedMeta.task_id) {
              sourcePath = FileService.resolveExtractedPath(
                parsedMeta.task_id as number,
                fileRecord.filename,
              );
            }
          }
        }
      }

      if (!sourcePath || !FileService.exists(sourcePath)) {
        const tried1 = FileService.resolveStoragePath(track.url);
        const tried2 = FileService.resolveUploadsPath(track.url);
        const tried3 = FileService.resolveExtractedPath(
          taskId,
          urlFilename || "",
        );

        sourcePath = tried1;
        if (!FileService.exists(sourcePath)) sourcePath = tried2;
        if (!FileService.exists(sourcePath)) sourcePath = tried3;
      }
    }

    let actualFormat = "vtt";
    if (track.track_type === "subtitle" && sourcePath) {
      const ext = sourcePath.split(".").pop()?.toLowerCase() || "";
      if (ext === "ass" || ext === "ssa" || ext === "srt") {
        actualFormat = ext;
      }
    }

    if (
      track.track_type === "subtitle" &&
      actualFormat !== "vtt" &&
      sourcePath &&
      FileService.exists(sourcePath)
    ) {
      const content = FileService.readFile(sourcePath) || "";
      if (content.trim().length > 0) {
        const existing = db.select().from(mediaCustomSubtitlesTable)
          .where(eq(mediaCustomSubtitlesTable.track_id, track.id))
          .get();
        if (existing) {
          db.update(mediaCustomSubtitlesTable).set({
            content,
            lang: track.lang || "und",
            label: track.label || "",
            format: actualFormat,
          }).where(eq(mediaCustomSubtitlesTable.id, existing.id)).run();
          logger.info(`Task ${taskId}: Updated custom subtitle track ${track.id} (${actualFormat})`);
        } else {
          db.insert(mediaCustomSubtitlesTable).values({
            task_id: taskId,
            track_id: track.id,
            format: actualFormat,
            content,
            lang: track.lang || "und",
            label: track.label || "",
          }).run();
          logger.info(`Task ${taskId}: Registered custom subtitle track ${track.id} (${actualFormat})`);
        }
      } else {
        logger.warn(`Task ${taskId}: Custom subtitle track ${track.id} has empty content, skipping`);
      }
      customTrackIds.add(track.id);
      continue;
    }

    let subtitlePlaylistNeeded = false;
    let subtitlePlaylistName = "";

    if (track.track_type === "subtitle") {
      subtitlePlaylistNeeded = true;
      subtitlePlaylistName = `subtitle_${track.id}_${track.lang || "und"}.m3u8`;
    }

    if (existsSync(tracksDir)) {
      const prefix =
        track.track_type === "subtitle"
          ? `subtitle_${track.id}_`
          : `audio_${track.id}_`;
      const oldFiles = readdirSync(tracksDir).filter(
        (f) =>
          f.startsWith(prefix) &&
          f !== `${prefix}${track.lang || "und"}.vtt` &&
          f !== `${prefix}${track.lang || "und"}.m4a`,
      );
      for (const oldFile of oldFiles) {
        await HlsS3Storage.deleteFile(join(tracksDir, oldFile));
        logger.info(`Task ${taskId}: Cleaned up old track file ${oldFile}`);
      }
      const oldPlaylists = readdirSync(outputDir).filter(
        (f) =>
          f.startsWith(prefix) &&
          f.endsWith(".m3u8") &&
          f !== subtitlePlaylistName,
      );
      for (const oldPl of oldPlaylists) {
        await HlsS3Storage.deleteFile(join(outputDir, oldPl));
        logger.info(`Task ${taskId}: Cleaned up old playlist ${oldPl}`);
      }
    }

    let finalDestPath: string | null = null;

    if (sourcePath && FileService.exists(sourcePath)) {
      let destFilename: string;
      if (track.track_type === "subtitle") {
        destFilename = `subtitle_${track.id}_${track.lang || "und"}.vtt`;
      } else {
        destFilename = `audio_${track.id}_${track.lang || "und"}.m4a`;
      }
      const destPath = join(tracksDir, destFilename);
      const success = FileService.copyPhysicalFile(sourcePath, destPath);
      if (success) {
        logger.info(`Task ${taskId}: Copied ${track.track_type} track to ${destFilename}`);
        finalDestPath = destPath;
      } else {
        logger.warn(`Task ${taskId}: Failed to copy ${track.track_type} track to ${destFilename}`);
      }
    } else if (track.track_type === "subtitle" && subtitlePlaylistName) {
      logger.warn(`Task ${taskId}: Source file not found for subtitle track, creating placeholder playlist`);
      const subPlaylistContent = buildSubtitlePlaylist("");
      const subPlaylistPath = join(outputDir, subtitlePlaylistName);
      await HlsS3Storage.writeFile(subPlaylistPath, subPlaylistContent);
    }

    if (subtitlePlaylistNeeded && finalDestPath) {
      const subPlaylistContent = buildSubtitlePlaylist(
        `tracks/${basename(finalDestPath)}`,
      );
      const subPlaylistPath = join(outputDir, subtitlePlaylistName);
      await HlsS3Storage.writeFile(subPlaylistPath, subPlaylistContent);
      logger.info(`Task ${taskId}: Created subtitle playlist ${subtitlePlaylistName}`);
    }

    if (!finalDestPath && !subtitlePlaylistName) {
      logger.warn(`Task ${taskId}: Source file not found for track: ${track.url}`);
    }
  }

  await updateMasterPlaylistWithTracks(
    taskId,
    outputDir,
    masterPlaylistPath,
    tracks,
    customTrackIds,
    logger,
  );
  logger.info(`Task ${taskId}: External tracks processed successfully`);
}

async function updateMasterPlaylistWithTracks(
  taskId: number,
  outputDir: string,
  masterPath: string,
  tracks: MediaTrack[],
  customTrackIds: Set<number>,
  logger: Logger,
) {
  if (!(await HlsS3Storage.exists(masterPath))) return;

  const masterContent = await HlsS3Storage.readFile(masterPath);
  if (!masterContent) return;

  const parsedMaster = M3U8Parser.parse(masterContent);
  if (!parsedMaster.masterInfo) return;

  const trackMap = new Map<number, MediaTrack[]>();
  for (const track of tracks) {
    if (!trackMap.has(track.id)) {
      trackMap.set(track.id, []);
    }
    trackMap.get(track.id)!.push(track);
  }

  const mediaToAdd: M3U8Media[] = [];
  const urisToRemove: string[] = [];

  for (const [trackId, trackGroup] of trackMap.entries()) {
    const latestTrack = trackGroup[trackGroup.length - 1];
    if (!latestTrack) continue;

    if (customTrackIds.has(trackId)) {
      urisToRemove.push(`subtitle_${trackId}_`);
      continue;
    }

    const trackLang = latestTrack.lang || "und";
    const trackName = latestTrack.label || trackLang;
    const isSubtitle = latestTrack.track_type === "subtitle";
    const isAudio = latestTrack.track_type === "audio";

    if (latestTrack.action === "remove") {
      urisToRemove.push(`subtitle_${trackId}_`);
      urisToRemove.push(`audio_${trackId}_`);
    } else if (
      latestTrack.action === "add" ||
      latestTrack.action === "replace" ||
      latestTrack.action === "map"
    ) {
      urisToRemove.push(
        isSubtitle ? `subtitle_${trackId}_` : `audio_${trackId}_`,
      );

      if (isSubtitle) {
        mediaToAdd.push({
          type: "SUBTITLES",
          groupId: "subs",
          name: trackName,
          lang: trackLang,
          uri: `subtitle_${trackId}_${trackLang}.m3u8`,
        });
      } else if (isAudio) {
        mediaToAdd.push({
          type: "AUDIO",
          groupId: "audio",
          name: trackName,
          lang: trackLang,
          uri: `audio_${trackId}_${trackLang}.m4a`,
        });
      }
    }
  }

  const hasSubtitleTracks = mediaToAdd.some((m) => m.type === "SUBTITLES");

  const result = editMasterPlaylist(masterContent, {
    addMedia: mediaToAdd,
    removeMediaByUri: urisToRemove.length > 0 ? urisToRemove : undefined,
    setVariantSubtitles: hasSubtitleTracks ? "subs" : undefined,
  });

  if (result.success) {
    await HlsS3Storage.writeFile(masterPath, result.content);
  }
}
