import { sqliteTable, integer, text, real, index } from "../core/index";

export const downloadTasksTable = sqliteTable("download_tasks", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("pending"),
  type: text("type").notNull().default("file"),
  progress: real("progress").notNull().default(0),
  downloaded_bytes: integer("downloaded_bytes").notNull().default(0),
  total_bytes: integer("total_bytes").notNull().default(0),
  error: text("error"),
  user_id: integer("user_id").notNull(),
  torrent_id: integer("torrent_id"),
  magnet: text("magnet"),
  file_path: text("file_path"),
  file_id: integer("file_id"),
  created_at: text("created_at").notNull().default("(datetime('now'))"),
  completed_at: text("completed_at"),
  updated_at: text("updated_at").notNull().default("(datetime('now'))"),
}, (table) => ({
  user_idx: index("idx_download_tasks_user", [table.user_id.name]),
  status_idx: index("idx_download_tasks_status", [table.status.name]),
}));
