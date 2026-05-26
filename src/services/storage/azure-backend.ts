import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import { join, dirname, basename } from "path";
import type { StorageBackend } from "./interface";

export interface AzureBackendConfig {
  connectionString: string;
  containerName: string;
  storageBaseDir: string;
}

export class AzureStorageBackend implements StorageBackend {
  readonly name = "azure";
  private enabled: boolean;

  constructor(private config: AzureBackendConfig) {
    this.enabled = !!(config.connectionString && config.containerName);
    if (!existsSync(config.storageBaseDir)) {
      mkdirSync(config.storageBaseDir, { recursive: true });
    }
  }

  isEnabled(): boolean { return this.enabled; }

  async readFile(absolutePath: string): Promise<string | null> {
    try {
      const res = await fetch(this.getBlobUrl(this.toStorageKey(absolutePath)));
      if (!res.ok) return null;
      return await res.text();
    } catch { return null; }
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
    if (!this.enabled) return;
    try {
      await fetch(this.getBlobUrl(this.toStorageKey(absolutePath)), {
        method: "PUT",
        body: content,
        headers: { "x-ms-blob-type": "BlockBlob" },
      });
    } catch (err) {
      console.warn(`[azure] Failed to upload:`, err);
    }
  }

  async exists(absolutePath: string): Promise<boolean> {
    if (existsSync(absolutePath)) return true;
    try {
      const res = await fetch(this.getBlobUrl(this.toStorageKey(absolutePath)), { method: "HEAD" });
      return res.ok;
    } catch { return false; }
  }

  async deleteFile(absolutePath: string): Promise<void> {
    if (existsSync(absolutePath)) unlinkSync(absolutePath);
    if (!this.enabled) return;
    try {
      await fetch(this.getBlobUrl(this.toStorageKey(absolutePath)), { method: "DELETE" });
    } catch (err) {
      console.warn(`[azure] Failed to delete:`, err);
    }
  }

  async readStream(absolutePath: string): Promise<ReadableStream<Uint8Array> | null> {
    if (existsSync(absolutePath)) return Bun.file(absolutePath).stream();
    try {
      const res = await fetch(this.getBlobUrl(this.toStorageKey(absolutePath)));
      if (!res.ok || !res.body) return null;
      return res.body;
    } catch { return null; }
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
          try {
            await fetch(this.getBlobUrl(key), {
              method: "PUT",
              body: readFileSync(full),
              headers: { "x-ms-blob-type": "BlockBlob" },
            });
          } catch (err) {
            console.warn(`[azure] Failed to upload ${key}:`, err);
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
    return this.getBlobUrl(this.toStorageKey(absolutePath));
  }

  toStorageKey(absolutePath: string): string {
    const base = this.config.storageBaseDir.replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(base)) {
      return normalized.slice(base.length).replace(/^\//, "");
    }
    return basename(normalized);
  }

  private getBlobUrl(key: string): string {
    const match = this.config.connectionString.match(/AccountName=([^;]+)/);
    const accountName = match ? match[1] : "unknown";
    return `https://${accountName}.blob.core.windows.net/${this.config.containerName}/${key}`;
  }
}
