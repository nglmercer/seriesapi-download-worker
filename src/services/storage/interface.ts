export interface StorageBackend {
  readonly name: string;
  isEnabled(): boolean;
  readFile(absolutePath: string): Promise<string | null>;
  writeFile(absolutePath: string, content: string): Promise<void>;
  exists(absolutePath: string): Promise<boolean>;
  deleteFile(absolutePath: string): Promise<void>;
  readStream(absolutePath: string): Promise<ReadableStream<Uint8Array> | null>;
  getSize(absolutePath: string): Promise<number>;
  uploadDir(localDir: string, remotePrefix: string): Promise<void>;
  deleteDir(localDir: string, remotePrefix: string): Promise<void>;
  getPublicUrl(absolutePath: string): string;
  toStorageKey(absolutePath: string): string;
}
