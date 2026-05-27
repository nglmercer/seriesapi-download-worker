import { z } from "zod";

const StorageBackendSchema = z.enum(["local", "s3", "gcs", "azure"]);
export type StorageBackend = z.infer<typeof StorageBackendSchema>;

const WorkerConfigSchema = z.object({
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

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadConfig(): WorkerConfig {
  const raw = {
    port: process.env.PORT,
    host: process.env.HOST,
    databasePath: process.env.DATABASE_PATH,
    sharedApiKey: process.env.SHARED_API_KEY,
    mainApiUrl: process.env.MAIN_API_URL,
    storageBackend: process.env.STORAGE_BACKEND,
    storageBaseDir: process.env.STORAGE_BASE_DIR,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
    s3Endpoint: process.env.S3_ENDPOINT,
    gcsProjectId: process.env.GCS_PROJECT_ID,
    gcsBucket: process.env.GCS_BUCKET,
    gcsKeyFile: process.env.GCS_KEY_FILE,
    azureConnectionString: process.env.AZURE_CONNECTION_STRING,
    azureContainerName: process.env.AZURE_CONTAINER_NAME,
    maxConcurrentTranscodes: process.env.MAX_CONCURRENT_TRANSCODES,
    ffmpegPath: process.env.FFMPEG_PATH,
    ffprobePath: process.env.FFPROBE_PATH,
  };

  const result = WorkerConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error("[config] Invalid configuration:");
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      console.error(`  - ${path}${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
