import type { StorageBackend } from "./interface";
import { LocalStorageBackend } from "./local-backend";

export class CompositeStorageBackend implements StorageBackend {
  readonly name: string;
  private primary: LocalStorageBackend;
  private cloud: StorageBackend | null;

  constructor(storageBaseDir: string, cloudBackend?: StorageBackend | null) {
    this.primary = new LocalStorageBackend(storageBaseDir);
    this.cloud = cloudBackend || null;
    this.name = this.cloud ? `composite(${this.cloud.name})` : "local";
  }

  isEnabled(): boolean {
    return true;
  }

  async readFile(absolutePath: string): Promise<string | null> {
    let content = await this.primary.readFile(absolutePath);
    if (content !== null) return content;
    if (this.cloud) {
      return await this.cloud.readFile(absolutePath);
    }
    return null;
  }

  async writeFile(absolutePath: string, content: string): Promise<void> {
    await this.primary.writeFile(absolutePath, content);
    if (this.cloud) {
      await this.cloud.writeFile(absolutePath, content);
    }
  }

  async exists(absolutePath: string): Promise<boolean> {
    if (await this.primary.exists(absolutePath)) return true;
    if (this.cloud) {
      return await this.cloud.exists(absolutePath);
    }
    return false;
  }

  async deleteFile(absolutePath: string): Promise<void> {
    await this.primary.deleteFile(absolutePath);
    if (this.cloud) {
      await this.cloud.deleteFile(absolutePath);
    }
  }

  async readStream(absolutePath: string): Promise<ReadableStream<Uint8Array> | null> {
    let stream = await this.primary.readStream(absolutePath);
    if (stream) return stream;
    if (this.cloud) {
      return await this.cloud.readStream(absolutePath);
    }
    return null;
  }

  async getSize(absolutePath: string): Promise<number> {
    const size = await this.primary.getSize(absolutePath);
    if (size > 0) return size;
    if (this.cloud) {
      return await this.cloud.getSize(absolutePath);
    }
    return 0;
  }

  async uploadDir(localDir: string, remotePrefix: string): Promise<void> {
    if (this.cloud) {
      await this.cloud.uploadDir(localDir, remotePrefix);
    }
  }

  async deleteDir(localDir: string, remotePrefix: string): Promise<void> {
    await this.primary.deleteDir(localDir, remotePrefix);
    if (this.cloud) {
      await this.cloud.deleteDir(localDir, remotePrefix);
    }
  }

  getPublicUrl(absolutePath: string): string {
    if (this.cloud) {
      return this.cloud.getPublicUrl(absolutePath);
    }
    return this.primary.getPublicUrl(absolutePath);
  }

  toStorageKey(absolutePath: string): string {
    return this.primary.toStorageKey(absolutePath);
  }
}
