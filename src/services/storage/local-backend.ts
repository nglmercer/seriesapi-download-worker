import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync, readdirSync, rmdirSync } from "fs";
import { join, dirname, sep } from "path";
import type { StorageBackend } from "./interface";

export class LocalStorageBackend implements StorageBackend {
  readonly name = "local";

  constructor(private storageBaseDir: string) {
    if (!existsSync(storageBaseDir)) {
      mkdirSync(storageBaseDir, { recursive: true });
    }
  }

  isEnabled(): boolean {
    return true;
  }

  async readFile(absolutePath: string): Promise<string | null> {
    if (!existsSync(absolutePath)) return null;
    return readFileSync(absolutePath, "utf-8");
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  async exists(absolutePath: string): Promise<boolean> {
    return existsSync(absolutePath);
  }

  async deleteFile(absolutePath: string): Promise<void> {
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }
  }

  async readStream(absolutePath: string): Promise<ReadableStream<Uint8Array> | null> {
    if (!existsSync(absolutePath)) return null;
    const file = Bun.file(absolutePath);
    return file.stream();
  }

  async getSize(absolutePath: string): Promise<number> {
    if (!existsSync(absolutePath)) return 0;
    return statSync(absolutePath).size;
  }

  async uploadDir(_localDir: string, _remotePrefix: string): Promise<void> {
  }

  async deleteDir(localDir: string, _remotePrefix: string): Promise<void> {
    if (!existsSync(localDir)) return;
    const removeRecursive = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          removeRecursive(full);
        } else {
          unlinkSync(full);
        }
      }
      rmdirSync(dir);
    };
    removeRecursive(localDir);
  }

  getPublicUrl(absolutePath: string): string {
    const storageDir = this.storageBaseDir.replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(storageDir)) {
      const relative = normalized.slice(storageDir.length).replace(/^\//, "");
      return `/api/v1/storage/${relative}`;
    }
    return absolutePath;
  }

  toStorageKey(absolutePath: string): string {
    const storageDir = this.storageBaseDir.replace(/\\/g, "/");
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(storageDir)) {
      return normalized.slice(storageDir.length).replace(/^\//, "");
    }
    return normalized;
  }
}
