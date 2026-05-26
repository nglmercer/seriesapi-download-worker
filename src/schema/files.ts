import {
  sqliteTable,
  integer,
  text,
  real,
  primaryKey,
  notNull,
  default_,
  references,
  index
} from "../core/index";

const NOW = "CURRENT_TIMESTAMP";

/**
 * files  –  uploaded storage details for uploads endpoint.
 */
export const filesTable = sqliteTable("files", {
  id: integer("id").primaryKey().autoincrement(),
  filename: text("filename").notNull(),
  original_name: text("original_name").notNull(),
  mime_type: text("mime_type").notNull(),
  size_bytes: integer("size_bytes").notNull(),
  category: text("category"), // e.g., 'video', 'subtitle', 'image'
  status: text("status").default("valid"), // 'valid', 'suspicious', 'quarantine', 'deleted'
  metadata: text("metadata"), // JSON
  user_id: integer("user_id"),
  created_at: text("created_at").default(NOW),
  updated_at: text("updated_at").default(NOW),
}, (table) => ({
  user_idIdx: index("user_id_idx", [table.user_id.name]),
}));

/**
 * user_quotas  –  per-user storage limits tracking.
 */
export const userQuotasTable = sqliteTable("user_quotas", {
  user_id: integer("user_id").notNull().primaryKey(),
  limit_bytes: integer("limit_bytes").notNull().default(10737418240), // 10 GB default
  used_bytes: integer("used_bytes").notNull().default(0),
  updated_at: text("updated_at").default(NOW),
}, (table) => ({
  user_idIdx: index("user_id_idx", [table.user_id.name]),
}));
