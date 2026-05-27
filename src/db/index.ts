import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../schema";

let _db: Database | null = null;
let _drizzle: BunSQLiteDatabase<typeof schema> | null = null;

export type DrizzleDb = BunSQLiteDatabase<typeof schema>;

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized. Call initializeDatabase() first.");
  return _db;
}

export function getDrizzle(): DrizzleDb {
  if (!_drizzle) throw new Error("Database not initialized. Call initializeDatabase() first.");
  return _drizzle;
}

export function initializeDatabase(dbPath: string): { db: Database; drizzle: DrizzleDb } {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
  }

  const database = new Database(dbPath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");

  const drizzleDb = drizzle(database, { schema });

  // Create tables
  database.exec(`
    CREATE TABLE IF NOT EXISTS download_tasks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      type TEXT NOT NULL DEFAULT 'file',
      progress REAL NOT NULL DEFAULT 0,
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      user_id INTEGER NOT NULL,
      torrent_id INTEGER,
      magnet TEXT,
      file_path TEXT,
      file_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS idx_download_tasks_user ON download_tasks(user_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON download_tasks(status)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      category TEXT,
      status TEXT DEFAULT 'valid',
      metadata TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS user_id_idx ON files(user_id)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS user_quotas (
      user_id INTEGER NOT NULL PRIMARY KEY,
      limit_bytes INTEGER NOT NULL DEFAULT 10737418240,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_custom_subtitles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      track_id INTEGER,
      format TEXT NOT NULL,
      content TEXT NOT NULL,
      lang TEXT,
      label TEXT,
      original_file_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS subtitle_task_id_idx ON media_custom_subtitles(task_id)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0.0,
      source_video_url TEXT NOT NULL,
      source_video_info TEXT,
      thumbnail_url TEXT,
      qualities TEXT,
      output_profile TEXT,
      video_codec TEXT DEFAULT 'libx264',
      audio_codec TEXT DEFAULT 'aac',
      preset TEXT DEFAULT 'veryfast',
      media_id INTEGER,
      season_id INTEGER,
      episode_id INTEGER,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS task_media_id_idx ON media_tasks(media_id)");
  database.exec("CREATE INDEX IF NOT EXISTS task_season_id_idx ON media_tasks(season_id)");
  database.exec("CREATE INDEX IF NOT EXISTS task_episode_id_idx ON media_tasks(episode_id)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_task_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      track_type TEXT NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      lang TEXT,
      is_external INTEGER DEFAULT 0,
      action TEXT DEFAULT 'add',
      replace_lang TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS track_task_id_idx ON media_task_tracks(task_id)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_hls_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      media_id INTEGER,
      season_id INTEGER,
      episode_id INTEGER,
      m3u8_url TEXT NOT NULL,
      master_url TEXT,
      quality TEXT,
      resolution TEXT,
      bandwidth INTEGER,
      is_active INTEGER DEFAULT 1,
      is_primary INTEGER DEFAULT 0,
      total_duration REAL,
      segments_count INTEGER,
      file_size INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS output_media_id_idx ON media_hls_outputs(media_id)");
  database.exec("CREATE INDEX IF NOT EXISTS output_season_id_idx ON media_hls_outputs(season_id)");
  database.exec("CREATE INDEX IF NOT EXISTS output_episode_id_idx ON media_hls_outputs(episode_id)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_hls_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER NOT NULL,
      season_id INTEGER,
      episode_id INTEGER,
      resource_type TEXT NOT NULL,
      quality TEXT,
      resolution TEXT,
      lang TEXT,
      label TEXT,
      master_url TEXT NOT NULL,
      playlist_url TEXT,
      source_task_id INTEGER,
      output_id INTEGER,
      is_available INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      bandwidth INTEGER,
      total_duration REAL,
      segments_count INTEGER,
      file_size INTEGER,
      codec_info TEXT,
      audio_tracks TEXT,
      subtitle_tracks TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS resource_media_id_idx ON media_hls_resources(media_id)");
  database.exec("CREATE INDEX IF NOT EXISTS resource_season_id_idx ON media_hls_resources(season_id)");
  database.exec("CREATE INDEX IF NOT EXISTS resource_episode_id_idx ON media_hls_resources(episode_id)");

  database.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY,
      entity_type TEXT,
      entity_id INTEGER,
      image_type TEXT,
      url TEXT,
      file_id INTEGER,
      is_primary INTEGER DEFAULT 0,
      source TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  _db = database;
  _drizzle = drizzleDb;

  console.log(`[worker] Database ready at ${dbPath}`);
  return { db: database, drizzle: drizzleDb };
}

export function closeDatabase(): void {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
    _drizzle = null;
  }
}
