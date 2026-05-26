import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { join, dirname, basename } from "path";
import type { StorageBackend } from "./interface";

export interface GcsBackendConfig {
  projectId: string;
  bucket: string;
  keyFile?: string;
  storageBaseDir: string;
}

export class GcsStorageBackend implements StorageBackend {
  readonly name = "gcs";
  private enabled: boolean;

  constructor(private config: GcsBackendConfig) {
    this.enabled = !!(config.projectId && config.bucket);
    if (!existsSync(config.storageBaseDir)) {
      mkdirSync(config.storageBaseDir, { recursive: true });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async readFile(absolutePath: string): Promise<string | null> {
    try {
      const url = this.getObjectUrl(this.toStorageKey(absolutePath));
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
    if (!this.enabled) return;
    try {
      const url = this.getUploadUrl(this.toStorageKey(absolutePath));
      await fetch(url, { method: "POST", body: content });
    } catch (err) {
      console.warn(`[gcs] Failed to upload:`, err);
    }
  }

  async exists(absolutePath: string): Promise<boolean> {
    if (existsSync(absolutePath)) return true;
    try {
      const url = this.getObjectUrl(this.toStorageKey(absolutePath));
      const res = await fetch(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async deleteFile(absolutePath: string): Promise<void> {
    if (existsSync(absolutePath)) unlinkSync(absolutePath);
    if (!this.enabled) return;
    try {
      const url = this.getObjectUrl(this.toStorageKey(absolutePath));
      await fetch(url, { method: "DELETE" });
    } catch (err) {
      console.warn(`[gcs] Failed to delete:`, err);
    }
  }

  async readStream(absolutePath: string): Promise<ReadableStream<Uint8Array> | null> {
    if (existsSync(absolutePath)) {
      return Bun.file(absolutePath).stream();
    }
    try {
      const res = await fetch(this.getObjectUrl(this.toStorageKey(absolutePath)));
      if (!res.ok || !res.body) return null;
      return res.body;
    } catch {
      return null;
    }
  }

  async getSize(absolutePath: string): Promise<number> {
    if (existsSync(absolutePath)) return statSync(absolutePath).size;
    return 0;
  }

  async uploadDir(localDir: string, remotePrefix: string): Promise<void> {
    if (!existsSync(localDir) || !this.enabled) return;
    const walk = async (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          await walk(full);
        } else {
          const relative = full.replace(localDir, "").replace(/^[/\\]/, "");
          const key = remotePrefix ? `${remotePrefix}/${relative}` : relative;
          const content = readFileSync(full);
          try {
            const url = this.getUploadUrl(key);
            await fetch(url, { method: "POST", body: content });
          } catch (err) {
            console.warn(`[gcs] Failed to upload ${key}:`, err);
          }
        }
      }
    };
    await walk(localDir);
  }

  async deleteDir(localDir: string, remotePrefix: string): Promise<void> {
    if (existsSync(localDir)) {
      const rem = (dir: string) => {
        for (const e of readdirSync(dir)) {
          const f = join(dir, e);
          statSync(f).isDirectory() ? rem(f) : unlinkSync(f);
        }
        rmdirSync(dir);
      };
      rem(localDir);
    }
  }

  getPublicUrl(absolutePath: string): string {
    return this.getObjectUrl(this.toStorageKey(absolutePath));
  }

  toStorageKey(absolutePath: string): string {
    const base = this.config.storageBaseDir.replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(base)) {
      return normalized.slice(base.length).replace(/^\//, "");
    }
    return basename(normalized);
  }

  private getObjectUrl(key: string): string {
    return `https://storage.googleapis.com/${this.config.bucket}/${key}`;
  }

  private getUploadUrl(key: string): string {
    return `https://storage.googleapis.com/upload/storage/v1/b/${this.config.bucket}/o?uploadType=media&name=${encodeURIComponent(key)}`;
  }
}
