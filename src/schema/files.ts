import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const filesTable = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  original_name: text("original_name").notNull(),
  mime_type: text("mime_type").notNull(),
  size_bytes: integer("size_bytes").notNull(),
  category: text("category"),
  status: text("status").default("valid"),
  metadata: text("metadata"),
  user_id: integer("user_id"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP"),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("user_id_idx").on(table.user_id),
]);

export const userQuotasTable = sqliteTable("user_quotas", {
  user_id: integer("user_id").notNull().primaryKey(),
  limit_bytes: integer("limit_bytes").notNull().default(10737418240),
  used_bytes: integer("used_bytes").notNull().default(0),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP"),
}, (table) => [
  index("user_quota_user_id_idx").on(table.user_id),
]);
