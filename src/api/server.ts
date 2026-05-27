import { initializeDatabase } from "../db/index";
import { createStorageBackend } from "../services/storage/factory";
import { FileService, setStaticFileService } from "../services/file.service";
import { DownloadService, DownloadType } from "../services/download/download.service";
import { TranscodingService } from "../services/transcoding/transcoder";
import { setCompatDb, setCompatStorage } from "../services/transcoding/compat";
import { setTranscodingContext } from "../services/transcoding/context";
import { QueueWorker } from "../services/queue/queue-worker";
import { WebSocketServer } from "./websocket/ws-server";
import { createRouter } from "./router";
import type { WorkerConfig } from "../config";

export let downloadService: DownloadService | null = null;
export { DownloadType };

export async function startServer(config: WorkerConfig) {
  const { db, drizzle } = initializeDatabase(config.databasePath);

  const storage = createStorageBackend({
    backend: config.storageBackend,
    storageBaseDir: config.storageBaseDir,
    s3AccessKeyId: config.s3AccessKeyId,
    s3SecretAccessKey: config.s3SecretAccessKey,
    s3Bucket: config.s3Bucket,
    s3Region: config.s3Region,
    s3Endpoint: config.s3Endpoint,
    gcsProjectId: config.gcsProjectId,
    gcsBucket: config.gcsBucket,
    gcsKeyFile: config.gcsKeyFile,
    azureConnectionString: config.azureConnectionString,
    azureContainerName: config.azureContainerName,
  });

  const fileService = new FileService(config.storageBaseDir);
  setStaticFileService(config.storageBaseDir);

  downloadService = new DownloadService(drizzle, fileService);
  await downloadService.recoverStaleDownloads();

  setCompatDb(drizzle, db);
  setCompatStorage(storage);
  setTranscodingContext(drizzle, fileService, storage);
  TranscodingService.initialize(drizzle, fileService, storage);
  TranscodingService.resetStaleTasks();

  const queueWorker = new QueueWorker(drizzle, 5000);
  queueWorker.start();

  const wsServer = new WebSocketServer(config.mainApiUrl, config.sharedApiKey);
  wsServer.subscribeToEvents();

  const router = createRouter(drizzle, db, fileService, config);

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: router,
    websocket: wsServer.getWebSocketHandlers(),
  });

  console.log(`[worker] HTTP server on http://${config.host}:${config.port}`);
  console.log(`[worker] WebSocket on ws://${config.host}:${config.port}`);

  return {
    server,
    stop: async () => {
      queueWorker.stop();
      TranscodingService.stopAll();
      server.stop();
    },
  };
}
