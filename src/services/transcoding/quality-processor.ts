import { FFmpegCommand } from "ffmpeg-lib";
import { join } from "path";
import { FileService } from "../file.service";
import type { CommandsMap, Logger } from "./types";

export function getTargetHeight(quality: string, sourceHeight: number): number {
  if (quality === "2160p") return Math.min(2160, sourceHeight);
  if (quality === "1440p") return Math.min(1440, sourceHeight);
  if (quality === "1080p") return Math.min(1080, sourceHeight);
  if (quality === "720p") return Math.min(720, sourceHeight);
  if (quality === "480p") return Math.min(480, sourceHeight);
  if (quality === "360p") return Math.min(360, sourceHeight);
  return sourceHeight;
}

export function getBitrateForHeight(height: number): number {
  if (height >= 1080) return 5_000_000;
  if (height >= 720) return 2_800_000;
  if (height >= 480) return 1_400_000;
  return 800_000;
}

export async function processQuality(
  sourceUrl: string,
  qualityDir: string,
  width: number,
  height: number,
  taskId: number,
  ffmpegPath: string,
  ffprobePath: string,
  commands: CommandsMap,
  logger: Logger,
  onProgress?: (percent: number) => void,
) {
  const bitrate = getBitrateForHeight(height);
  const bitrateKbps = `${Math.round(bitrate / 1000)}k`;
  const playlistPath = join(qualityDir, "index.m3u8");
  const segmentPattern = join(qualityDir, "segment%03d.ts");

  const cmd = new FFmpegCommand({ ffmpegPath, ffprobePath })
    .input(sourceUrl)
    .videoCodec("libx264")
    .videoFilters(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    )
    .outputOptions([
      "-sn",
      "-preset veryfast",
      "-crf 21",
      "-pix_fmt yuv420p",
      "-profile:v high",
      "-level 4.0",
      "-g 48",
      "-keyint_min 48",
      "-sc_threshold 0",
      "-f hls",
      "-hls_time 6",
      "-hls_list_size 0",
      "-hls_playlist_type vod",
      "-hls_segment_type mpegts",
      "-hls_flags independent_segments",
      `-hls_segment_filename ${segmentPattern}`,
      "-muxdelay 0",
      "-avoid_negative_ts make_zero",
      "-map_metadata -1",
      "-map_chapters -1",
    ])
    .audioCodec("aac")
    .audioBitrate("128k")
    .audioChannels(2)
    .audioFrequency(48000)
    .output(playlistPath);

  cmd.on("progress", (p) => {
    const pct = p.percent ?? 0;
    if (onProgress) onProgress(pct);
  });

  commands.set(taskId, cmd);
  await cmd.run();
}

export async function processQualityOriginal(
  sourceUrl: string,
  qualityDir: string,
  taskId: number,
  ffmpegPath: string,
  ffprobePath: string,
  commands: CommandsMap,
  logger: Logger,
  onProgress?: (percent: number) => void,
) {
  const playlistPath = join(qualityDir, "index.m3u8");
  const segmentPattern = join(qualityDir, "segment%03d.ts");

  const cmd = new FFmpegCommand({ ffmpegPath, ffprobePath })
    .input(sourceUrl)
    .videoCodec("copy")
    .audioCodec("copy")
    .outputOptions([
      "-sn",
      "-f hls",
      "-hls_time 6",
      "-hls_list_size 0",
      "-hls_playlist_type vod",
      "-hls_segment_type mpegts",
      "-hls_flags independent_segments",
      `-hls_segment_filename ${segmentPattern}`,
      "-muxdelay 0",
      "-avoid_negative_ts make_zero",
      "-map_metadata -1",
      "-map_chapters -1",
    ])
    .output(playlistPath);

  cmd.on("progress", (p) => {
    const pct = p.percent ?? 0;
    if (onProgress) onProgress(pct);
  });

  commands.set(taskId, cmd);
  await cmd.run();
}
