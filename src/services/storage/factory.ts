import { CompositeStorageBackend } from "./composite-backend";
import { S3StorageBackend } from "./s3-backend";
import { GcsStorageBackend } from "./gcs-backend";
import { AzureStorageBackend } from "./azure-backend";
import type { StorageBackend } from "./interface";

export interface StorageConfig {
  backend: "local" | "s3" | "gcs" | "azure";
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
}

export function createStorageBackend(config: StorageConfig): CompositeStorageBackend {
  let cloudBackend: StorageBackend | null = null;

  switch (config.backend) {
    case "s3":
      cloudBackend = new S3StorageBackend({
        accessKeyId: config.s3AccessKeyId || "",
        secretAccessKey: config.s3SecretAccessKey || "",
        bucket: config.s3Bucket || "seriesapi",
        region: config.s3Region || "us-east-1",
        endpoint: config.s3Endpoint,
        storageBaseDir: config.storageBaseDir,
      });
      break;
    case "gcs":
      cloudBackend = new GcsStorageBackend({
        projectId: config.gcsProjectId || "",
        bucket: config.gcsBucket || "",
        keyFile: config.gcsKeyFile,
        storageBaseDir: config.storageBaseDir,
      });
      break;
    case "azure":
      cloudBackend = new AzureStorageBackend({
        connectionString: config.azureConnectionString || "",
        containerName: config.azureContainerName || "",
        storageBaseDir: config.storageBaseDir,
      });
      break;
  }

  return new CompositeStorageBackend(config.storageBaseDir, cloudBackend);
}
