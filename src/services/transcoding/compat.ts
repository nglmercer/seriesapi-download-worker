import { eq, and, or, like, desc, asc, ne, gt, gte, lt, lte, notLike, inArray, notInArray, isNull, isNotNull, between, not, sql } from "drizzle-orm";
import type { DrizzleDb } from "../../db/index";
import type { Database as BunDatabase } from "bun:sqlite";
import type { FileService } from "../file.service";
import type { CompositeStorageBackend } from "../storage/composite-backend";

let gDb: DrizzleDb | null = null;
let gRawDb: BunDatabase | null = null;
let gStorage: CompositeStorageBackend | null = null;
let gFileService: FileService | null = null;

export function setCompatDb(db: DrizzleDb, rawDb: BunDatabase) { gDb = db; gRawDb = rawDb; }
export function setCompatStorage(storage: CompositeStorageBackend) { gStorage = storage; }
export function setCompatFileService(fs: FileService) { gFileService = fs; }

export function getDb(): DrizzleDb {
  if (!gDb) throw new Error("Compat DB not initialized");
  return gDb;
}

export function getRawDb(): BunDatabase {
  if (!gRawDb) throw new Error("Compat raw DB not initialized");
  return gRawDb;
}

export function runRaw(sqlStr: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
  if (!gRawDb) throw new Error("Compat raw DB not initialized");
  const result = gRawDb.run(sqlStr, ...params as any[]);
  return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
}

export function queryRaw<T = unknown>(sql: string, ...params: unknown[]): T[] {
  if (!gRawDb) throw new Error("Compat raw DB not initialized");
  return gRawDb.query(sql).all(...params as any[]) as T[];
}

export function getRaw<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
  if (!gRawDb) throw new Error("Compat raw DB not initialized");
  return gRawDb.query(sql).get(...params as any[]) as T | undefined;
}

export const drizzle = new Proxy({} as DrizzleDb, {
  get(_t, prop: string) {
    if (!gDb) throw new Error("Compat DB not initialized");
    const val = (gDb as unknown as Record<string, unknown>)[prop];
    return typeof val === "function" ? val.bind(gDb) : val;
  },
});

export const HlsS3Storage = {
  async exists(path: string): Promise<boolean> {
    if (!gStorage) throw new Error("Compat storage not initialized");
    return gStorage.exists(path);
  },
  async readFile(path: string): Promise<string | null> {
    if (!gStorage) throw new Error("Compat storage not initialized");
    return gStorage.readFile(path);
  },
  async writeFile(path: string, content: string): Promise<void> {
    if (!gStorage) throw new Error("Compat storage not initialized");
    return gStorage.writeFile(path, content);
  },
  async deleteFile(path: string): Promise<boolean> {
    if (!gStorage) throw new Error("Compat storage not initialized");
    await gStorage.deleteFile(path);
    return true;
  },
  async uploadDir(dir: string, prefix: string): Promise<void> {
    if (!gStorage) throw new Error("Compat storage not initialized");
    return gStorage.uploadDir(dir, prefix);
  },
};

export { eq, and, or, like, desc, asc, ne, gt, gte, lt, lte, notLike, inArray, notInArray, isNull, isNotNull, between, not, sql };
