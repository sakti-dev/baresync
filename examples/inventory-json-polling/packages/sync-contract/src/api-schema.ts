import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const syncBatchRequests = sqliteTable(
  "sync_batch_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: text("client_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    }).notNull(),
    responseBody: text("response_body"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("sync_batch_requests_client_idemp_idx").on(
      table.clientId,
      table.idempotencyKey
    ),
  ]
);
