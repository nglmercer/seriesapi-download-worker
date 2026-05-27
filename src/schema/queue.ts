import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const mediaCustomSubtitlesTable = sqliteTable("media_custom_subtitles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: integer("task_id").notNull(),
  track_id: integer("track_id"),
  format: text("format").notNull(),
  content: text("content").notNull(),
  lang: text("lang"),
  label: text("label"),
  original_file_id: integer("original_file_id"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("subtitle_task_id_idx").on(table.task_id),
]);

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

export const mediaTasksTable = sqliteTable("media_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("task_media_id_idx").on(table.media_id),
  index("task_season_id_idx").on(table.season_id),
  index("task_episode_id_idx").on(table.episode_id),
]);

export const mediaTaskTracksTable = sqliteTable("media_task_tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: integer("task_id").notNull(),
  track_type: text("track_type").notNull(),
  url: text("url").notNull(),
  label: text("label"),
  lang: text("lang"),
  is_external: integer("is_external").default(0),
  action: text("action").default("add"),
  replace_lang: text("replace_lang"),
  metadata: text("metadata"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("track_task_id_idx").on(table.task_id),
]);

export const mediaHlsOutputsTable = sqliteTable("media_hls_outputs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: integer("task_id").notNull(),
  media_id: integer("media_id"),
  season_id: integer("season_id"),
  episode_id: integer("episode_id"),
  m3u8_url: text("m3u8_url").notNull(),
  master_url: text("master_url"),
  quality: text("quality"),
  resolution: text("resolution"),
  bandwidth: integer("bandwidth"),
  is_active: integer("is_active").default(1),
  is_primary: integer("is_primary").default(0),
  total_duration: real("total_duration"),
  segments_count: integer("segments_count"),
  file_size: integer("file_size"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("output_media_id_idx").on(table.media_id),
  index("output_season_id_idx").on(table.season_id),
  index("output_episode_id_idx").on(table.episode_id),
]);

export const mediaHlsResourcesTable = sqliteTable("media_hls_resources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  media_id: integer("media_id").notNull(),
  season_id: integer("season_id"),
  episode_id: integer("episode_id"),
  resource_type: text("resource_type").notNull(),
  quality: text("quality"),
  resolution: text("resolution"),
  lang: text("lang"),
  label: text("label"),
  master_url: text("master_url").notNull(),
  playlist_url: text("playlist_url"),
  source_task_id: integer("source_task_id"),
  output_id: integer("output_id"),
  is_available: integer("is_available").default(1),
  is_active: integer("is_active").default(1),
  bandwidth: integer("bandwidth"),
  total_duration: real("total_duration"),
  segments_count: integer("segments_count"),
  file_size: integer("file_size"),
  codec_info: text("codec_info"),
  audio_tracks: text("audio_tracks"),
  subtitle_tracks: text("subtitle_tracks"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("resource_media_id_idx").on(table.media_id),
  index("resource_season_id_idx").on(table.season_id),
  index("resource_episode_id_idx").on(table.episode_id),
]);

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
  is_primary: integer("is_primary").default(0),
  source: text("source"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
});
