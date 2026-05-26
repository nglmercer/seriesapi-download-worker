import type { SqliteNapiAdapter } from "../../core/index";
import type { FileService } from "../file.service";
import type { CompositeStorageBackend } from "../storage/composite-backend";

let gDb: SqliteNapiAdapter | null = null;
let gStorage: CompositeStorageBackend | null = null;
let gFileService: FileService | null = null;

export function setCompatDb(db: SqliteNapiAdapter) { gDb = db; }
export function setCompatStorage(storage: CompositeStorageBackend) { gStorage = storage; }
export function setCompatFileService(fs: FileService) { gFileService = fs; }

export function getDb(): any {
  if (!gDb) throw new Error("Compat DB not initialized");
  return gDb;
}

export const drizzle = new Proxy({} as SqliteNapiAdapter, {
  get(_t, prop: string) {
    if (!gDb) throw new Error("Compat DB not initialized");
    const val = (gDb as any)[prop];
    return typeof val === "function" ? val.bind(gDb) : val;
  },
});

export const HlsS3Storage = new Proxy({} as Record<string, any>, {
  get(_t, prop: string) {
    if (!gStorage) throw new Error("Compat storage not initialized");
    const val = (gStorage as any)[prop];
    return typeof val === "function" ? val.bind(gStorage) : val;
  },
});

export { eq, and, or, like, desc, asc, ne, gt, gte, lt, lte, notLike, inArray, notInArray, isNull, isNotNull, between, not, sql } from "../../core/index";
