import { FFmpegCommand } from "ffmpeg-lib";
import { join } from "path";
import { eq, like, and } from "drizzle-orm";
import { getDb, runRaw } from "./compat";
import { FileService } from "../file.service";
import { mediaTaskTracksTable, mediaCustomSubtitlesTable } from "../../schema/queue";
import type { SubtitleStream, Logger } from "./types";

export async function extractSubtitlesToVTT(
  taskId: number,
  videoUrl: string,
  subtitleStreams: SubtitleStream[],
  ffmpegPath: string,
  ffprobePath: string,
  logger: Logger,
) {
  const db = getDb();
  const extractDir = FileService.getTaskExtractDir(taskId);
  for (const sub of subtitleStreams) {
    const index = sub.index;
    const lang = sub.tags?.language || "und";
    const label = sub.tags?.title || `Subtitle ${index}`;
    const codec = sub.codec_name || "unknown";

    let ext = "srt";
    if (codec === "ass" || codec === "ssa") ext = "ass";
    if (codec === "mov_text") ext = "vtt";

    const originalFilename = `subtitle_${index}.${ext}`;
    const originalPath = join(extractDir, originalFilename);

    try {
      const existingTrack = db.select().from(mediaTaskTracksTable)
        .where(and(
          eq(mediaTaskTracksTable.task_id, taskId),
          like(mediaTaskTracksTable.url, `%${originalFilename}%`),
        )).get();

      if (existingTrack) {
        logger.info(
          `Task ${taskId}: Subtitle ${index} already extracted, skipping`,
        );
        continue;
      }

      const cmd = new FFmpegCommand({ ffmpegPath, ffprobePath })
        .input(videoUrl)
        .outputOptions([`-map 0:${index}`])
        .output(originalPath);

      await cmd.run();

      let rawContent = FileService.readFile(originalPath);
      if (
        !rawContent ||
        rawContent.trim().length === 0 ||
        (ext === "vtt" && rawContent.trim() === "WEBVTT")
      ) {
        logger.info(
          `Task ${taskId}: Subtitle ${index} is empty, skipping`,
        );
        FileService.deletePhysicalFile(originalPath);
        continue;
      }

      FileService.registerExistingFile(db, originalPath, {
        original_name: `${label}.${ext}`,
        category: "subtitle",
        metadata: { original_codec: codec, format: ext, task_id: taskId },
      });

      let finalUrl = `/uploads/extracted/${taskId}/${originalFilename}`;

      if (ext !== "vtt") {
        const vttFfmpegName = `subtitle_${index}_ffmpeg.vtt`;
        const vttFfmpegPath = join(extractDir, vttFfmpegName);

        try {
          const cmdVtt = new FFmpegCommand({ ffmpegPath, ffprobePath })
            .input(videoUrl)
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
              metadata: {
                task_id: taskId,
                original_codec: codec,
                format: "vtt",
              },
            });
            finalUrl = `/uploads/extracted/${taskId}/${vttFfmpegName}`;
          } else {
            FileService.deletePhysicalFile(vttFfmpegPath);
          }
        } catch (e) {
          logger.warn(
            `Task ${taskId}: Failed to extract native VTT for track ${index}`,
            e,
          );
        }
      }

      const trackResult = runRaw(
        `INSERT INTO media_task_tracks (task_id, track_type, url, label, lang, is_external, action, metadata)
         VALUES (?, ?, ?, ?, ?, 0, 'add', ?)`,
        taskId,
        "subtitle",
        finalUrl,
        label,
        lang,
        JSON.stringify({ original_codec: codec, original_ext: ext }),
      );

      if (ext !== "vtt" && rawContent && rawContent.trim().length > 0) {
        runRaw(
          `INSERT INTO media_custom_subtitles (task_id, track_id, format, content, lang, label)
           VALUES (?, ?, ?, ?, ?, ?)`,
          taskId,
          Number(trackResult.lastInsertRowid),
          ext,
          rawContent,
          lang,
          label,
        );
        logger.info(
          `Task ${taskId}: Registered custom subtitle ${index} (${ext}) for API serving`,
        );
      }

      logger.info(
        `Task ${taskId}: Extracted main subtitle -> ${finalUrl} [${lang}]`,
      );
    } catch (err) {
      logger.error(
        `Task ${taskId}: Failed to extract subtitle ${index}:`,
        err,
      );
    }
  }
}
