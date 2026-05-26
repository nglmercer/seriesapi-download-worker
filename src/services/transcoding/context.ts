import type { SqliteNapiAdapter } from "../../core/index";
import type { FileService } from "../file.service";
import type { CompositeStorageBackend } from "../storage/composite-backend";

let _db: SqliteNapiAdapter | null = null;
let _fileService: FileService | null = null;
let _storage: CompositeStorageBackend | null = null;

export function setTranscodingContext(db: SqliteNapiAdapter, fileService: FileService, storage: CompositeStorageBackend) {
  _db = db;
  _fileService = fileService;
  _storage = storage;
}

export function getTranscodingDb(): SqliteNapiAdapter {
  if (!_db) throw new Error("Transcoding context not initialized");
  return _db;
}

export function getTranscodingFileService(): FileService {
  if (!_fileService) throw new Error("Transcoding context not initialized");
  return _fileService;
}

export function getTranscodingStorage(): CompositeStorageBackend {
  if (!_storage) throw new Error("Transcoding context not initialized");
  return _storage;
}
