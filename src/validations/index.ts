import { z } from "zod";

// ── Common ──────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const EntityFiltersSchema = z.object({
  media_id: z.coerce.number().int().positive().optional(),
  season_id: z.coerce.number().int().positive().optional(),
  episode_id: z.coerce.number().int().positive().optional(),
});

export const EntityIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const EntityTypeSchema = z.enum(["media", "episode", "season"]);

// ── Downloads ───────────────────────────────────────────────

export const CreateDownloadSchema = z.object({
  url: z.string().url("Invalid URL format"),
  filename: z.string().min(1).max(255).optional(),
  category: z.string().max(50).optional(),
  type: z.enum(["file", "magnet", "torrent"]).optional(),
});

export const DownloadIdSchema = z.object({
  id: z.string().min(1).max(100),
});

export const DeleteDownloadQuerySchema = z.object({
  deleteFiles: z.coerce.boolean().default(false),
});

// ── Queue ───────────────────────────────────────────────────

export const CreateQueueTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  source_video_url: z.string().min(1),
  thumbnail_url: z.string().optional(),
  media_id: z.number().int().positive().optional(),
  season_id: z.number().int().positive().optional(),
  episode_id: z.number().int().positive().optional(),
});

export const UpdateQueueTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  qualities: z.array(z.string()).optional(),
  source_video_url: z.string().min(1).optional(),
  thumbnail_url: z.string().optional(),
  media_id: z.number().int().positive().optional(),
  season_id: z.number().int().positive().optional(),
  episode_id: z.number().int().positive().optional(),
});

export const QueueTaskIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const AddQualitySchema = z.object({
  quality: z.string().min(1).max(20),
});

export const SetQualitiesSchema = z.object({
  qualities: z.array(z.string().min(1).max(20)).min(1),
});

export const SeekParamSchema = z.object({
  seek: z.coerce.number().min(0).optional(),
});

export const ThumbnailEntitySchema = z.object({
  entityType: EntityTypeSchema,
  entityId: z.coerce.number().int().positive(),
});

// ── Tracks ──────────────────────────────────────────────────

export const AddTrackSchema = z.object({
  type: z.enum(["audio", "subtitle"]),
  file_id: z.number().int().positive().optional(),
  url: z.string().optional(),
  label: z.string().max(100).optional(),
  lang: z.string().max(10).optional(),
  is_external: z.boolean().optional(),
  action: z.enum(["add", "replace", "remove", "map"]),
  replace_lang: z.string().max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.file_id !== undefined || data.url !== undefined,
  { message: "Either file_id or url must be provided" }
);

export const UpdateTrackSchema = z.object({
  type: z.string().optional(),
  label: z.string().max(100).optional(),
  lang: z.string().max(10).optional(),
  action: z.enum(["add", "replace", "remove", "map"]).optional(),
  replace_lang: z.string().max(10).optional(),
  is_external: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  file_id: z.number().int().positive().optional(),
  url: z.string().optional(),
});

export const TrackIdSchema = z.object({
  trackId: z.coerce.number().int().positive(),
});

// ── Files ───────────────────────────────────────────────────

export const FileServeParamsSchema = z.object({
  path: z.string().min(1),
});

export const UploadFileSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => file.size > 0,
    { message: "File cannot be empty" }
  ).refine(
    (file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ["mp4", "mkv", "webm", "avi", "mov", "ts", "m4v"].includes(ext || "");
    },
    { message: "Unsupported file type" }
  ),
});

// ── Outputs ─────────────────────────────────────────────────

export const OutputFiltersSchema = z.object({
  media_id: z.string().optional(),
  season_id: z.string().optional(),
  episode_id: z.string().optional(),
});

export const CheckExistingSchema = z.object({
  media_id: z.string().min(1),
  season_id: z.string().optional(),
  episode_id: z.string().optional(),
});

// ── WebSocket ───────────────────────────────────────────────

export const WsAuthMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});

export const WsSubscribeJobSchema = z.object({
  type: z.literal("subscribe:job"),
  jobId: z.string().min(1),
});

export const WsUnsubscribeJobSchema = z.object({
  type: z.literal("unsubscribe:job"),
  jobId: z.string().min(1),
});

export const WsSubscribeEntitySchema = z.object({
  type: z.literal("subscribe:entity"),
  entityType: z.enum(["media", "season", "episode"]),
  entityId: z.number().int().positive(),
});

export const WsUnsubscribeEntitySchema = z.object({
  type: z.literal("unsubscribe:entity"),
  entityType: z.enum(["media", "season", "episode"]),
  entityId: z.number().int().positive(),
});

export const WsPingSchema = z.object({
  type: z.literal("ping"),
});

export const WsMessageSchema = z.discriminatedUnion("type", [
  WsAuthMessageSchema,
  WsSubscribeJobSchema,
  WsUnsubscribeJobSchema,
  WsSubscribeEntitySchema,
  WsUnsubscribeEntitySchema,
  WsPingSchema,
]);

// ── Config ──────────────────────────────────────────────────

export const StorageBackendSchema = z.enum(["local", "s3", "gcs", "azure"]);

export const WorkerConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(5001),
  host: z.string().default("0.0.0.0"),
  databasePath: z.string().min(1).default("data/worker.db"),
  sharedApiKey: z.string().min(1).default("change-me"),
  mainApiUrl: z.string().url().default("http://localhost:3000"),
  storageBackend: StorageBackendSchema.default("local"),
  storageBaseDir: z.string().min(1).default("storage"),
  s3AccessKeyId: z.string().optional(),
  s3SecretAccessKey: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3Region: z.string().optional(),
  s3Endpoint: z.string().optional(),
  gcsProjectId: z.string().optional(),
  gcsBucket: z.string().optional(),
  gcsKeyFile: z.string().optional(),
  azureConnectionString: z.string().optional(),
  azureContainerName: z.string().optional(),
  maxConcurrentTranscodes: z.coerce.number().int().min(1).max(10).default(1),
  ffmpegPath: z.string().optional(),
  ffprobePath: z.string().optional(),
});

// ── Inferred Types ──────────────────────────────────────────

export type CreateDownloadInput = z.infer<typeof CreateDownloadSchema>;
export type CreateQueueTaskInput = z.infer<typeof CreateQueueTaskSchema>;
export type UpdateQueueTaskInput = z.infer<typeof UpdateQueueTaskSchema>;
export type AddTrackInput = z.infer<typeof AddTrackSchema>;
export type UpdateTrackInput = z.infer<typeof UpdateTrackSchema>;
export type WsMessage = z.infer<typeof WsMessageSchema>;
export type WorkerConfigInput = z.infer<typeof WorkerConfigSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type EntityFiltersInput = z.infer<typeof EntityFiltersSchema>;
