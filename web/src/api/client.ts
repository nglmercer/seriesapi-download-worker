import type {
  ApiConfig,
  DownloadTask,
  QueueTask,
  TaskListResult,
  ProbeResult,
  HlsOutput,
  MediaTrack,
  VideoFile,
  FileUploadResponse,
  HealthResponse,
  ThumbnailResponse,
  EntityThumbnailResponse,
  ProbeQueueResponse,
  ExistingContentResponse,
  BackfillResponse,
  SuccessResponse,
  QualitiesResponse,
} from "../types";

function getConfig(): ApiConfig {
  const stored = localStorage.getItem("worker-api-config");
  if (stored) return JSON.parse(stored);
  return { baseUrl: "", apiKey: "change-me", userId: 1 };
}

interface ErrorResponse {
  error?: string;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "X-User-Id": String(cfg.userId),
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(url, { ...opts, headers });
  const data: unknown = await res.json();
  if (!res.ok) {
    const errData = data as ErrorResponse;
    throw new Error(errData?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  setConfig(cfg: ApiConfig) {
    localStorage.setItem("worker-api-config", JSON.stringify(cfg));
  },

  getConfig,

  health() {
    return request<HealthResponse>("/health");
  },

  // ── Downloads ──────────────────────────────────────────────

  listDownloads() {
    return request<{ tasks: DownloadTask[] }>("/api/v1/downloads");
  },

  createDownload(body: { url: string; filename?: string; category?: string; type?: string }) {
    return request<{ taskId: string }>("/api/v1/downloads", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getDownload(id: string) {
    return request<DownloadTask>(`/api/v1/downloads/${id}`);
  },

  deleteDownload(id: string, deleteFiles = false) {
    return request<SuccessResponse>(`/api/v1/downloads/${id}?deleteFiles=${deleteFiles}`, {
      method: "DELETE",
    });
  },

  pauseDownload(id: string) {
    return request<SuccessResponse>(`/api/v1/downloads/${id}/pause`, { method: "POST" });
  },

  resumeDownload(id: string) {
    return request<SuccessResponse>(`/api/v1/downloads/${id}/resume`, { method: "POST" });
  },

  cancelDownload(id: string) {
    return request<SuccessResponse>(`/api/v1/downloads/${id}/cancel`, { method: "POST" });
  },

  // ── Queue ──────────────────────────────────────────────────

  listQueue(page = 1, limit = 20, filters?: { media_id?: number; season_id?: number; episode_id?: number }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.media_id) params.set("media_id", String(filters.media_id));
    if (filters?.season_id) params.set("season_id", String(filters.season_id));
    if (filters?.episode_id) params.set("episode_id", String(filters.episode_id));
    return request<TaskListResult>(`/api/v1/queue?${params}`);
  },

  createQueueTask(body: {
    title: string;
    description?: string;
    source_video_url: string;
    thumbnail_url?: string;
    media_id?: number;
    season_id?: number;
    episode_id?: number;
  }) {
    return request<QueueTask>("/api/v1/queue", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getQueueTask(id: number) {
    return request<QueueTask>(`/api/v1/queue/${id}`);
  },

  updateQueueTask(id: number, body: Partial<QueueTask>) {
    return request<QueueTask>(`/api/v1/queue/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  deleteQueueTask(id: number) {
    return request<SuccessResponse>(`/api/v1/queue/${id}`, { method: "DELETE" });
  },

  startQueueTask(id: number) {
    return request<SuccessResponse>(`/api/v1/queue/${id}/start`, { method: "POST" });
  },

  probeQueueTask(id: number) {
    return request<ProbeQueueResponse>(
      `/api/v1/queue/${id}/probe`,
      { method: "POST" }
    );
  },

  stopQueueTask(id: number) {
    return request<SuccessResponse>(`/api/v1/queue/${id}/stop`, { method: "POST" });
  },

  restartQueueTask(id: number) {
    return request<{ success: boolean; status: string; message: string }>(
      `/api/v1/queue/${id}/restart`,
      { method: "POST" }
    );
  },

  getTaskOutputs(id: number) {
    return request<HlsOutput[]>(`/api/v1/queue/${id}/outputs`);
  },

  addQuality(id: number, quality: string) {
    return request<{ success: boolean; quality: string; message: string; status: string }>(
      `/api/v1/queue/${id}/add-quality`,
      { method: "POST", body: JSON.stringify({ quality }) }
    );
  },

  setQualities(id: number, qualities: string[]) {
    return request<QueueTask>(`/api/v1/queue/${id}/quality`, {
      method: "POST",
      body: JSON.stringify({ qualities }),
    });
  },

  extractTracks(id: number) {
    return request<MediaTrack[]>(`/api/v1/queue/${id}/extract-tracks`, { method: "POST" });
  },

  extractAudio(id: number) {
    return request<MediaTrack[]>(`/api/v1/queue/${id}/extract-audio`, { method: "POST" });
  },

  processTracks(id: number) {
    return request<{ success: boolean; message: string }>(`/api/v1/queue/${id}/process-tracks`, {
      method: "POST",
    });
  },

  generateThumbnail(id: number, seek?: string) {
    const params = seek ? `?seek=${seek}` : "";
    return request<ThumbnailResponse>(
      `/api/v1/queue/${id}/thumbnail${params}`,
      { method: "POST" }
    );
  },

  backfillTask(id: number) {
    return request<BackfillResponse>(`/api/v1/queue/${id}/backfill`, {
      method: "POST",
    });
  },

  addTrack(id: number, track: { type: string; url?: string; file_id?: number; label?: string; lang?: string; is_external?: boolean; action?: string; replace_lang?: string; metadata?: string }) {
    return request<MediaTrack>(`/api/v1/queue/${id}/tracks`, {
      method: "POST",
      body: JSON.stringify(track),
    });
  },

  updateTrack(id: number, trackId: number, body: Partial<MediaTrack>) {
    return request<MediaTrack>(`/api/v1/queue/${id}/tracks/${trackId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  deleteTrack(id: number, trackId: number) {
    return request<SuccessResponse>(`/api/v1/queue/${id}/tracks/${trackId}`, {
      method: "DELETE",
    });
  },

  // ── Global Queue ───────────────────────────────────────────

  getOutputs(filters: { media_id?: string; season_id?: string; episode_id?: string }) {
    const params = new URLSearchParams();
    if (filters.media_id) params.set("media_id", filters.media_id);
    if (filters.season_id) params.set("season_id", filters.season_id);
    if (filters.episode_id) params.set("episode_id", filters.episode_id);
    return request<HlsOutput[]>(`/api/v1/queue/outputs?${params}`);
  },

  getQualities() {
    return request<QualitiesResponse>("/api/v1/queue/qualities");
  },

  checkExisting(mediaId: string, seasonId?: string, episodeId?: string) {
    const params = new URLSearchParams({ media_id: mediaId });
    if (seasonId) params.set("season_id", seasonId);
    if (episodeId) params.set("episode_id", episodeId);
    return request<ExistingContentResponse>(
      `/api/v1/queue/check-existing?${params}`
    );
  },

  backfillAll() {
    return request<BackfillResponse>("/api/v1/queue/backfill", {
      method: "POST",
    });
  },

  generateEntityThumbnail(type: "media" | "episode" | "season", entityId: number, seek?: string) {
    const params = seek ? `?seek=${seek}` : "";
    return request<EntityThumbnailResponse>(
      `/api/v1/queue/thumbnail/${type}/${entityId}${params}`,
      { method: "POST" }
    );
  },

  // ── Files ────────────────────────────────────────────────

  listFiles() {
    return request<{ files: VideoFile[] }>("/api/v1/files");
  },

  getFileServeUrl(path: string): string {
    const cfg = getConfig();
    return `${cfg.baseUrl}/api/v1/files/serve/${path}`;
  },

  uploadFile(file: File): Promise<FileUploadResponse> {
    const cfg = getConfig();
    const url = `${cfg.baseUrl}/api/v1/files/upload`;
    const formData = new FormData();
    formData.append("file", file);
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "X-User-Id": String(cfg.userId),
      },
      body: formData,
    }).then(async (res) => {
      const data: unknown = await res.json();
      if (!res.ok) {
        const errData = data as ErrorResponse;
        throw new Error(errData?.error ?? `HTTP ${res.status}`);
      }
      return data as FileUploadResponse;
    });
  },
};
