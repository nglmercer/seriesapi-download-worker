export interface WorkerConfig {
  port: number;
  host: string;
  databasePath: string;
  sharedApiKey: string;
  mainApiUrl: string;
  storageBackend: "local" | "s3" | "gcs" | "azure";
  storageBaseDir: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Endpoint?: string;
  gcsProjectId?: string;
  gcsBucket?: string;
  gcsKeyFile?: string;
  azureConnectionString?: string;
  azureContainerName?: string;
  maxConcurrentTranscodes: number;
  ffmpegPath?: string;
  ffprobePath?: string;
}

export function loadConfig(): WorkerConfig {
  return {
    port: parseInt(process.env.PORT || "3001", 10),
    host: process.env.HOST || "0.0.0.0",
    databasePath: process.env.DATABASE_PATH || "data/worker.db",
    sharedApiKey: process.env.SHARED_API_KEY || "change-me",
    mainApiUrl: process.env.MAIN_API_URL || "http://localhost:3000",
    storageBackend: (process.env.STORAGE_BACKEND as any) || "local",
    storageBaseDir: process.env.STORAGE_BASE_DIR || "storage",
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
    maxConcurrentTranscodes: parseInt(process.env.MAX_CONCURRENT_TRANSCODES || "1", 10),
    ffmpegPath: process.env.FFMPEG_PATH,
    ffprobePath: process.env.FFPROBE_PATH,
  };
}
