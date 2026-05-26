import {
  sqliteTable,
  integer,
  text,
  real,
  boolean,
  primaryKey,
  notNull,
  default_,
  references,
  index
} from "../core/index";

const NOW = "CURRENT_TIMESTAMP";

/**
 * media_custom_subtitles  –  external subtitle files for custom formats
 * (ass, ssa, srt) that cannot be embedded in HLS m3u8 playlists.
 * These are served as raw text via a dedicated API endpoint instead.
 */
export const mediaCustomSubtitlesTable = sqliteTable("media_custom_subtitles", {
  id: integer("id").primaryKey().autoincrement(),
  task_id: integer("task_id").notNull(),
  track_id: integer("track_id"),
  format: text("format").notNull(),
  content: text("content").notNull(),
  lang: text("lang"),
  label: text("label"),
  original_file_id: integer("original_file_id"),
  created_at: text("created_at").default(NOW),
}, (table) => ({
  task_id_idx: index("task_id_idx", [table.task_id.name]),
}));

export const QUALITY_PRESETS = ["2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "original"] as const;
export type QualityPreset = typeof QUALITY_PRESETS[number];

export interface QualityConfig {
  height: number;
  bandwidth: number;
  audio_bitrate: string;
}

export const QUALITY_CONFIGS: Record<Exclude<QualityPreset, "original">, QualityConfig> = {
  "2160p": { height: 2160, bandwidth: 15_000_000, audio_bitrate: "256k" },
  "1440p": { height: 1440, bandwidth: 8_000_000, audio_bitrate: "192k" },
  "1080p": { height: 1080, bandwidth: 5_000_000, audio_bitrate: "128k" },
  "720p": { height: 720, bandwidth: 2_800_000, audio_bitrate: "128k" },
  "480p": { height: 480, bandwidth: 1_400_000, audio_bitrate: "96k" },
  "360p": { height: 360, bandwidth: 800_000, audio_bitrate: "96k" },
  "240p": { height: 240, bandwidth: 400_000, audio_bitrate: "64k" },
};

export interface AudioTrackConfig {
  lang: string;
  label: string;
  bitrate?: string;
  channels?: number;
}

export interface SubtitleTrackConfig {
  lang: string;
  label: string;
  format?: "vtt" | "ass" | "srt";
  default?: boolean;
  forced?: boolean;
}

export interface OutputProfile {
  name: string;
  qualities: QualityPreset[];
  audio_tracks: AudioTrackConfig[];
  subtitle_tracks: SubtitleTrackConfig[];
}

export const DEFAULT_OUTPUT_PROFILES: Record<string, OutputProfile> = {
  "full": {
    name: "Full Quality",
    qualities: ["2160p", "1440p", "1080p", "720p", "480p", "360p"],
    audio_tracks: [],
    subtitle_tracks: [],
  },
  "hd": {
    name: "HD Only",
    qualities: ["1080p", "720p", "480p"],
    audio_tracks: [],
    subtitle_tracks: [],
  },
  "mobile": {
    name: "Mobile",
    qualities: ["720p", "480p", "360p", "240p"],
    audio_tracks: [],
    subtitle_tracks: [],
  },
};

/**
 * media_tasks  –  transcoding queue tasks.
 *
 * Workflow:
 *   1. Create  →  provide title, content linkage, source_video_url.
 *   2. Probe   →  POST /:id/probe runs ffprobe, fills source_video_info + suggested qualities.
 *   3. Configure → PUT /:id sets chosen qualities (and optional track list).
 *   4. Start   →  POST /:id/start begins encoding.
 *
 * Content linkage:
 *   media_id   (required) → the parent movie or series.
 *   season_id  (optional) → set only for series/season tasks.
 *   episode_id (optional) → set only for episode-specific tasks.
 *
 * Derivable entity type:
 *   episode_id IS NOT NULL → "episode"
 *   season_id  IS NOT NULL → "season"
 *   otherwise              → "media"  (movie or full-series)
 */
export const mediaTasksTable = sqliteTable("media_tasks", {
  id: integer("id").primaryKey().autoincrement(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("pending"),
  progress: real("progress").default(0.0),

  source_video_url: text("source_video_url").notNull(),
  source_video_info: text("source_video_info"),
  thumbnail_url: text("thumbnail_url"),

  qualities: text("qualities"),
  output_profile: text("output_profile"),

  video_codec: text("video_codec").default("libx264"),
  audio_codec: text("audio_codec").default("aac"),
  preset: text("preset").default("veryfast"),

  media_id: integer("media_id"),
  season_id: integer("season_id"),
  episode_id: integer("episode_id"),

  error_message: text("error_message"),
  created_at: text("created_at").default(NOW),
  updated_at: text("updated_at").default(NOW),
}, (table) => ({
  media_idIdx: index("media_id_idx", [table.media_id.name]),
  season_idIdx: index("season_id_idx", [table.season_id.name]),
  episode_idIdx: index("episode_id_idx", [table.episode_id.name]),
}));

/**
 * media_task_tracks  –  optional audio and subtitle tracks for a task.
 */
export const mediaTaskTracksTable = sqliteTable("media_task_tracks", {
  id: integer("id").primaryKey().autoincrement(),
  task_id: integer("task_id").notNull(),
  track_type: text("track_type").notNull(),
  url: text("url").notNull(),
  label: text("label"),
  lang: text("lang"),
  is_external: boolean("is_external").default(0),
  action: text("action").default("add"),
  replace_lang: text("replace_lang"),
  metadata: text("metadata"),
  created_at: text("created_at").default(NOW),
  updated_at: text("updated_at").default(NOW),
}, (table) => ({
  task_id_idx: index("task_id_idx", [table.task_id.name]),

}));

/**
 * media_hls_outputs  –  resulting HLS streams produced by a task.
 */
export const mediaHlsOutputsTable = sqliteTable("media_hls_outputs", {
  id: integer("id").primaryKey().autoincrement(),
  task_id: integer("task_id").notNull(),

  media_id: integer("media_id"),
  season_id: integer("season_id"),
  episode_id: integer("episode_id"),

  m3u8_url: notNull(text("m3u8_url")),
  master_url: text("master_url"),
  quality: text("quality"),
  resolution: text("resolution"),
  bandwidth: integer("bandwidth"),
  is_active: boolean("is_active").default(1),
  is_primary: boolean("is_primary").default(0),
  total_duration: real("total_duration"),
  segments_count: integer("segments_count"),
  file_size: integer("file_size"),
  created_at: text("created_at").default(NOW),
}, (table) => ({
  media_idIdx: index("media_id_idx", [table.media_id.name]),
  season_idIdx: index("season_id_idx", [table.season_id.name]),
  episode_idIdx: index("episode_id_idx", [table.episode_id.name]),
}));

/**
 * media_hls_resources  –  reusable HLS resources for deduplication.
 * 
 * Tracks all available HLS outputs across tasks to avoid duplicate transcoding.
 * Can be queried to find existing quality tracks for a media/episode.
 */
export const mediaHlsResourcesTable = sqliteTable("media_hls_resources", {
  id: integer("id").primaryKey().autoincrement(),

  media_id: integer("media_id").notNull(),
  season_id: integer("season_id"),
  episode_id: integer("episode_id"),

  resource_type: notNull(text("resource_type")),
  quality: text("quality"),
  resolution: text("resolution"),
  lang: text("lang"),
  label: text("label"),

  master_url: text("master_url").notNull(),
  playlist_url: text("playlist_url"),

  source_task_id: integer("source_task_id"),
  output_id: integer("output_id"),

  is_available: boolean("is_available").default(1),
  is_active: boolean("is_active").default(1),

  bandwidth: integer("bandwidth"),
  total_duration: real("total_duration"),
  segments_count: integer("segments_count"),
  file_size: integer("file_size"),

  codec_info: text("codec_info"),
  audio_tracks: text("audio_tracks"),
  subtitle_tracks: text("subtitle_tracks"),

  created_at: text("created_at").default(NOW),
  updated_at: text("updated_at").default(NOW),
}, (table) => ({
  media_idIdx: index("media_id_idx", [table.media_id.name]),
  season_idIdx: index("season_id_idx", [table.season_id.name]),
  episode_idIdx: index("episode_id_idx", [table.episode_id.name]),
}));

export const mediaTable = sqliteTable("media", {
  id: integer("id").primaryKey(),
});

export const imagesTable = sqliteTable("images", {
  id: integer("id").primaryKey(),
  entity_type: text("entity_type"),
  entity_id: integer("entity_id"),
  image_type: text("image_type"),
  url: text("url"),
  file_id: integer("file_id"),
  is_primary: boolean("is_primary").default(0),
  source: text("source"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
});
