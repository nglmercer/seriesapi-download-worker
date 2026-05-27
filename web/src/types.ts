export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  status: "pending" | "downloading" | "seeding" | "completed" | "failed" | "paused";
  type: "file" | "magnet" | "torrent";
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  error?: string;
  user_id: number;
  torrent_id?: number;
  magnet?: string;
  file_path?: string;
  file_id?: number;
  created_at: string;
  completed_at?: string;
}

export interface QueueTask {
  id: number;
  title: string;
  description?: string;
  status: string;
  progress: number;
  source_video_url: string;
  source_video_info?: string;
  thumbnail_url?: string;
  qualities?: string;
  output_profile?: string;
  video_codec?: string;
  audio_codec?: string;
  preset?: string;
  media_id?: number;
  season_id?: number;
  episode_id?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
  tracks?: MediaTrack[];
  outputs?: HlsOutput[];
}

export interface MediaTrack {
  id: number;
  task_id: number;
  track_type: string;
  url: string;
  label?: string;
  lang?: string;
  is_external: boolean;
  action: string;
  replace_lang?: string;
  metadata?: string;
  created_at: string;
}

export interface HlsOutput {
  id: number;
  task_id: number;
  media_id?: number;
  season_id?: number;
  episode_id?: number;
  m3u8_url: string;
  master_url?: string;
  quality?: string;
  resolution?: string;
  bandwidth?: number;
  is_active: boolean;
  is_primary: boolean;
  total_duration?: number;
  segments_count?: number;
  file_size?: number;
  created_at: string;
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

export interface QualityConfig {
  width: number;
  height: number;
  bitrate: string;
  maxrate: string;
  bufsize: string;
  label: string;
}

export interface TaskListResult {
  rows: QueueTask[];
  total: number;
  page: number;
  limit: number;
}

export interface DownloadProgressMsg {
  type: "download:progress";
  taskId: string;
  userId: number;
  progress: number;
  status: string;
  filename?: string;
  downloaded?: number;
  total?: number;
  speed?: number;
  file_path?: string;
  error?: string;
}

export interface TranscodeProgressMsg {
  type: "transcode:progress";
  taskId: number;
  userId?: number;
  progress: number;
  status: string;
  quality?: string;
  step?: number;
  totalSteps?: number;
  media_id?: number;
  season_id?: number;
  episode_id?: number;
  error?: string;
}

export interface HlsReadyMsg {
  type: "hls:ready";
  taskId: number;
  status: string;
  media_id?: number;
  season_id?: number;
  episode_id?: number;
}

export type WsMessage = DownloadProgressMsg | TranscodeProgressMsg | HlsReadyMsg | { type: "connected"; userId: number } | { type: "pong" } | { type: "error"; error: string };

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  userId: number;
}

export interface VideoFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  ext: string;
}

export interface FileUploadResponse {
  success: boolean;
  filename: string;
  original_name: string;
  path: string;
  size: number;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export interface ThumbnailResponse {
  id: number;
  url: string;
  seek_time: string;
  task_id: number;
}

export interface EntityThumbnailResponse {
  url: string;
  generated: boolean;
  file_id?: number;
}

export interface ProbeQueueResponse extends ProbeResult {
  source_video_info: string;
  qualities: string[];
}

export interface ExistingContentResponse {
  qualities: string[];
  subtitles: string[];
  audio: string[];
}

export interface BackfillResponse {
  totalOutputs?: number;
  updated: number;
  errors: number;
}

export interface SuccessResponse {
  success: boolean;
}

export interface QualitiesResponse {
  qualities: string[];
  configs: Record<string, QualityConfig>;
}
