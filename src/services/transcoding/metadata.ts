import { join } from "path";
import { existsSync, statSync, readdirSync } from "fs";
import { getDb } from "./compat";
import { M3U8Parser } from "./m3u8-parser";
import { HlsS3Storage } from "./compat";
import type { Logger } from "./types";

export async function extractOutputMetadata(
  taskId: number,
  outputDir: string,
  qualities: string[],
  logger: Logger,
) {
  const db = getDb();

  for (const quality of qualities) {
    const playlistPath = join(outputDir, quality, "index.m3u8");

    if (!(await HlsS3Storage.exists(playlistPath))) continue;

    try {
      const content = await HlsS3Storage.readFile(playlistPath);
      const parsed = content ? M3U8Parser.parse(content, playlistPath) : null;
      if (!parsed || parsed.type !== "variant" || !parsed.variantInfo) continue;

      const { totalDuration, segments } = parsed.variantInfo;

      const qualityDir = join(outputDir, quality);
      let fileSize = 0;
      if (existsSync(qualityDir)) {
        const files = readdirSync(qualityDir);
        for (const file of files) {
          const filePath = join(qualityDir, file);
          try {
            const stats = statSync(filePath);
            fileSize += stats.size;
          } catch {}
        }
      }

      db.run(
        `UPDATE media_hls_outputs
         SET total_duration = ?, segments_count = ?, file_size = ?
         WHERE task_id = ? AND quality = ?`,
        [
          Math.round(totalDuration * 100) / 100,
          segments,
          fileSize,
          taskId,
          quality,
        ],
      );

      logger.info(
        `Task ${taskId}: ${quality} metadata — duration=${Math.round(totalDuration)}s, segments=${segments}, size=${Math.round(fileSize / 1024)}KB`,
      );
    } catch (err) {
      logger.warn(
        `Task ${taskId}: Failed to extract metadata for ${quality}`,
        err,
      );
    }
  }
}
