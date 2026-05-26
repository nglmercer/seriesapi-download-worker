import { Database } from "sqlite-napi";
import { sqliteNapi } from "../core/index";
import { ALL_TABLES } from "../schema";
import type { SqliteNapiAdapter } from "../core/index";

let _db: Database | null = null;
let _drizzle: SqliteNapiAdapter | null = null;

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized. Call initializeDatabase() first.");
  return _db;
}

export function getDrizzle(): SqliteNapiAdapter {
  if (!_drizzle) throw new Error("Database not initialized. Call initializeDatabase() first.");
  return _drizzle;
}

export function initializeDatabase(dbPath: string): { db: Database; drizzle: SqliteNapiAdapter } {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
  }

  const database = new Database(dbPath);
  database.pragma("journal_mode", "WAL");
  database.pragma("foreign_keys", 1);

  const drizzleAdapter = sqliteNapi(database);
  drizzleAdapter.sync([...ALL_TABLES]);

  _db = database;
  _drizzle = drizzleAdapter;

  console.log(`[worker] Database ready — ${ALL_TABLES.length} tables at ${dbPath}`);
  return { db: database, drizzle: drizzleAdapter };
}

export function closeDatabase(): void {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
    _drizzle = null;
  }
}
