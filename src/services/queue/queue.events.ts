import { EventEmitter } from "events";

export interface DownloadProgressData {
  status: "pending" | "starting" | "connecting" | "downloading" | "completed" | "failed" | "paused" | "seeding";
  filename?: string;
  downloaded?: number;
  total?: number;
  speed?: number;
  file_path?: string;
  error?: string;
}

export interface TranscodeProgressData {
  taskId: number;
  userId?: number | null;
  progress: number;
  status: "processing" | "completed" | "failed" | "stopped";
  quality?: string;
  step?: number;
  totalSteps?: number;
  media_id?: number;
  season_id?: number;
  episode_id?: number;
  error?: string;
}

export interface HlsReadyData {
  taskId: number;
  status: "completed" | "failed";
  media_id?: number;
  season_id?: number;
  episode_id?: number;
}

export declare interface EventBus {
  on(event: "download:progress", listener: (taskId: string, userId: number, progress: number, data: DownloadProgressData) => void): this;
  on(event: "transcode:progress", listener: (data: TranscodeProgressData) => void): this;
  on(event: "hls:ready", listener: (data: HlsReadyData) => void): this;
  emit(event: "download:progress", taskId: string, userId: number, progress: number, data: DownloadProgressData): boolean;
  emit(event: "transcode:progress", data: TranscodeProgressData): boolean;
  emit(event: "hls:ready", data: HlsReadyData): boolean;
}

export class EventBus extends EventEmitter {
  constructor() {
    super();
  }

  emitDownloadProgress(taskId: string, userId: number, progress: number, data: DownloadProgressData) {
    this.emit("download:progress", taskId, userId, progress, data);
  }

  emitTranscodeProgress(data: TranscodeProgressData) {
    this.emit("transcode:progress", data);
  }

  emitHlsReady(data: HlsReadyData) {
    this.emit("hls:ready", data);
  }
}

let _eventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!_eventBus) _eventBus = new EventBus();
  return _eventBus;
}
