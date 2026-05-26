export interface MediaTask {
  id: number;
  title: string;
  status:
    | "pending"
    | "probing"
    | "ready"
    | "processing"
    | "completed"
    | "failed"
    | "stopped";
  progress: number;
  source_video_url: string;
  source_video_info?: string;
  qualities?: string;
  media_id: number;
  season_id?: number;
  episode_id?: number;
  error_message?: string;
}

export interface MediaTrack {
  id: number;
  task_id: number;
  track_type: "audio" | "subtitle";
  url: string;
  label?: string;
  lang?: string;
  is_external: number;
  action: "add" | "replace" | "remove";
  replace_lang?: string;
  metadata?: string;
}

export interface SubtitleStream {
  index: number;
  codec_name?: string;
  tags?: Record<string, string>;
}

export interface Logger {
  info: (...msg: any[]) => void;
  warn: (...msg: any[]) => void;
  error: (...msg: any[]) => void;
}

export type CommandsMap = Map<number, import("ffmpeg-lib").FFmpegCommand>;
