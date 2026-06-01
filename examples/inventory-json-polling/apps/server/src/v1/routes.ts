import { SYNC_UPSERT_ORDER } from "@sync-contract/generated/2026-05-31/sync-table-order";
import {
  createSyncPullHandler,
  createSyncPushHandler,
  createSyncStatusHandler,
} from "baresync/server";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import {
  createInventorySyncRepository,
  type InventoryScope,
} from "../db/v1/drizzle-helper/sync-repository";

type InventoryDb = BunSQLiteDatabase<Record<string, never>>;

export function createV1Routes({
  db,
  resolveScope,
}: {
  db: InventoryDb;
  resolveScope: ({
    scopeId,
  }: {
    scopeId: string;
  }) =>
    | { ok: true; scope: InventoryScope }
    | { ok: false; status: number; body: { error: string } };
}) {
  const idempotencyDb = db as unknown as SqliteRemoteDatabase;
  const repository = createInventorySyncRepository(db);

  const push = createSyncPushHandler({
    encoding: "json",
    idempotency: { db: idempotencyDb },
    resolveScope,
    upsertOrder: SYNC_UPSERT_ORDER,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  });

  const pull = createSyncPullHandler({
    encoding: "json",
    limit: 1000,
    resolveScope,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  });

  const status = createSyncStatusHandler({
    encoding: "json",
    resolveScope,
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  });

  return { push, pull, status };
}
