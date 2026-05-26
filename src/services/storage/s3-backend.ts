import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { join, dirname, basename } from "path";
import type { StorageBackend } from "./interface";

export interface S3BackendConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  storageBaseDir: string;
}

export class S3StorageBackend implements StorageBackend {
  readonly name = "s3";
  private s3Client: any = null;
  private enabled: boolean;

  constructor(private config: S3BackendConfig) {
    this.enabled = !!(config.accessKeyId && config.secretAccessKey);
    if (!existsSync(config.storageBaseDir)) {
      mkdirSync(config.storageBaseDir, { recursive: true });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private getClient(): any {
    if (!this.s3Client) {
      this.s3Client = new (Bun as any).S3Client({
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        bucket: this.config.bucket,
        region: this.config.region,
        endpoint: this.config.endpoint,
      });
    }
    return this.s3Client;
  }

  async readFile(absolutePath: string): Promise<string | null> {
    try {
      const s3file = this.getClient().file(this.toStorageKey(absolutePath));
      if (!await s3file.exists()) return null;
      return await s3file.text();
    } catch {
      return null;
    }
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
    if (!this.enabled) return;
    try {
      const s3file = this.getClient().file(this.toStorageKey(absolutePath));
      await s3file.write(content);
    } catch (err) {
      console.warn(`[s3] Failed to write ${this.toStorageKey(absolutePath)}:`, err);
    }
  }

  async exists(absolutePath: string): Promise<boolean> {
    if (existsSync(absolutePath)) return true;
    if (!this.enabled) return false;
    try {
      const s3file = this.getClient().file(this.toStorageKey(absolutePath));
      return await s3file.exists();
    } catch {
      return false;
    }
  }

  async deleteFile(absolutePath: string): Promise<void> {
    if (existsSync(absolutePath)) unlinkSync(absolutePath);
    if (!this.enabled) return;
    try {
      const s3file = this.getClient().file(this.toStorageKey(absolutePath));
      await s3file.delete();
    } catch (err) {
      console.warn(`[s3] Failed to delete ${this.toStorageKey(absolutePath)}:`, err);
    }
  }

  async readStream(absolutePath: string): Promise<ReadableStream<Uint8Array> | null> {
    if (existsSync(absolutePath)) {
      const file = Bun.file(absolutePath);
      return file.stream();
    }
    return null;
  }

  async getSize(absolutePath: string): Promise<number> {
    if (existsSync(absolutePath)) return statSync(absolutePath).size;
    return 0;
  }

  async uploadDir(localDir: string, remotePrefix: string): Promise<void> {
    if (!existsSync(localDir) || !this.enabled) return;
    const client = this.getClient();
    const walk = async (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          await walk(full);
        } else {
          const relative = full.replace(localDir, "").replace(/^[/\\]/, "");
          const key = remotePrefix ? `${remotePrefix}/${relative}` : relative;
          try {
            const content = readFileSync(full);
            const s3file = client.file(key);
            await s3file.write(content);
          } catch (err) {
            console.warn(`[s3] Failed to upload ${key}:`, err);
          }
        }
      }
    };
    await walk(localDir);
  }

  async deleteDir(localDir: string, remotePrefix: string): Promise<void> {
    if (existsSync(localDir)) {
      const removeRecursive = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) removeRecursive(full);
          else unlinkSync(full);
        }
        rmdirSync(dir);
      };
      removeRecursive(localDir);
    }
  }

  getPublicUrl(absolutePath: string): string {
    const key = this.toStorageKey(absolutePath);
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.config.bucket}/${key}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  toStorageKey(absolutePath: string): string {
    const base = this.config.storageBaseDir.replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(base)) {
      return normalized.slice(base.length).replace(/^\//, "");
    }
    return basename(normalized);
  }
}
