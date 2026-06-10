import { and, eq, lt, ne, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { syncBatchRequests } from "../schema/server-schema.js";

type Awaitable<T> = T | Promise<T>;

export interface SyncIdempotencyDatabase<TTransaction = unknown> {
  transaction<TResult>(
    callback: (tx: TTransaction) => Awaitable<TResult>
  ): Awaitable<TResult>;
}

export type SyncIdempotencyTransaction<TDb> =
  TDb extends SyncIdempotencyDatabase<infer TTransaction>
    ? TTransaction
    : never;

export class ConflictRequestError extends Error {
  // fallow-ignore-next-line unused-class-member
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictRequestError";
  }
}

interface GuardParams {
  clientId: string;
  idempotencyKey: string;
  requestHash: string;
}

interface GuardResult<T> {
  result: T;
  wasReplay: boolean;
}

type SyncBatchRequestRow = typeof syncBatchRequests.$inferSelect;

async function loadPushBatchResponse(
  tx: unknown,
  params: GuardParams
): Promise<SyncBatchRequestRow | null> {
  const rows = await (
    tx as {
      select: () => {
        from: (table: unknown) => {
          where: (condition: unknown) => Promise<SyncBatchRequestRow[]>;
        };
      };
    }
  )
    .select()
    .from(syncBatchRequests)
    .where(
      and(
        eq(syncBatchRequests.clientId, params.clientId),
        eq(syncBatchRequests.idempotencyKey, params.idempotencyKey)
      )
    );
  return rows[0] ?? null;
}

async function reservePushBatchResponse(
  tx: unknown,
  params: GuardParams
): Promise<void> {
  await (
    tx as {
      insert: (table: unknown) => {
        values: (data: unknown) => Promise<void>;
      };
    }
  )
    .insert(syncBatchRequests)
    .values({
      clientId: params.clientId,
      idempotencyKey: params.idempotencyKey,
      requestHash: params.requestHash,
      status: "pending",
      responseBody: '{"pending":true}',
      createdAt: Date.now(),
    });
}

async function finalizePushBatchResponse(
  tx: unknown,
  params: GuardParams & { response: unknown }
): Promise<void> {
  await (
    tx as {
      update: (table: unknown) => {
        set: (data: unknown) => {
          where: (condition: unknown) => Promise<void>;
        };
      };
    }
  )
    .update(syncBatchRequests)
    .set({
      status: "completed",
      responseBody: JSON.stringify(params.response),
      completedAt: Date.now(),
    })
    .where(
      and(
        eq(syncBatchRequests.clientId, params.clientId),
        eq(syncBatchRequests.idempotencyKey, params.idempotencyKey)
      )
    );
}

async function reclaimStalePendingRow(
  db: unknown,
  params: GuardParams
): Promise<void> {
  await (
    db as {
      update: (table: unknown) => {
        set: (data: unknown) => {
          where: (condition: unknown) => Promise<void>;
        };
      };
    }
  )
    .update(syncBatchRequests)
    .set({
      status: "pending",
      responseBody: '{"pending":true}',
      createdAt: Date.now(),
    })
    .where(
      and(
        eq(syncBatchRequests.clientId, params.clientId),
        eq(syncBatchRequests.idempotencyKey, params.idempotencyKey)
      )
    );
}

async function deletePendingRow(
  db: unknown,
  params: GuardParams
): Promise<void> {
  await (
    db as {
      delete: (table: unknown) => {
        where: (condition: unknown) => Promise<void>;
      };
    }
  )
    .delete(syncBatchRequests)
    .where(
      and(
        eq(syncBatchRequests.clientId, params.clientId),
        eq(syncBatchRequests.idempotencyKey, params.idempotencyKey)
      )
    );
}

export function createIdempotencyGuard<TDb extends SyncIdempotencyDatabase>({
  db,
  pendingTimeoutMs = 30_000,
}: {
  db: TDb;
  pendingTimeoutMs?: number;
}) {
  return {
    async run<T>(
      params: GuardParams,
      callback: () => Promise<T>
    ): Promise<GuardResult<T>> {
      const existing = await loadPushBatchResponse(db, params);

      if (existing) {
        if (
          existing.status === "completed" &&
          existing.requestHash === params.requestHash
        ) {
          return {
            result: JSON.parse(existing.responseBody!) as T,
            wasReplay: true,
          };
        }
        if (existing.status === "completed") {
          throw new ConflictRequestError(
            "idempotency key already used with different request body"
          );
        }
        if (existing.status === "pending") {
          const age = Date.now() - existing.createdAt;
          if (age < pendingTimeoutMs) {
            throw new ConflictRequestError(
              "sync push is already in progress"
            );
          }
          // Stale — reclaim via UPDATE in-place, row stays as pending
          await reclaimStalePendingRow(db, params);
        }
      }

      // Reserve — only INSERT if no row exists (not reclaimed)
      if (!existing) {
        try {
          await reservePushBatchResponse(db, params);
        } catch (reserveError) {
          const reloaded = await loadPushBatchResponse(db, params);
          if (!reloaded) {
            throw reserveError;
          }
          if (
            reloaded.status === "completed" &&
            reloaded.requestHash === params.requestHash
          ) {
            return {
              result: JSON.parse(reloaded.responseBody!) as T,
              wasReplay: true,
            };
          }
          throw new ConflictRequestError("sync push is already in progress");
        }
      }

      // Callback — cleanup pending row on failure
      let result: T;
      try {
        result = await callback();
      } catch (callbackError) {
        try {
          await deletePendingRow(db, params);
        } catch {
          // Swallow cleanup error — original error is more important
        }
        throw callbackError;
      }

      await finalizePushBatchResponse(db, { ...params, response: result });
      return { result, wasReplay: false };
    },
  };
}

export async function cleanupSyncBatchRequests<
  TDb extends SyncIdempotencyDatabase,
>(options: {
  db: TDb;
  olderThanMs: number;
  stalePendingOlderThanMs?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<{
  deletedCount: number;
  oldestDeleted?: string;
  newestDeleted?: string;
}> {
  const cutoff = Date.now() - options.olderThanMs;
  const staleCutoff =
    options.stalePendingOlderThanMs === undefined
      ? undefined
      : Date.now() - options.stalePendingOlderThanMs;

  const completedCondition = and(
    lt(syncBatchRequests.createdAt, cutoff),
    ne(syncBatchRequests.status, "pending")
  );

  const stalePendingCondition =
    staleCutoff === undefined
      ? undefined
      : and(
          lt(syncBatchRequests.createdAt, staleCutoff),
          eq(syncBatchRequests.status, "pending")
        );

  const combinedWhere =
    stalePendingCondition === undefined
      ? completedCondition
      : sql`(${completedCondition}) OR (${stalePendingCondition})`;

  const queryDb = options.db as unknown as Pick<
    BaseSQLiteDatabase<"sync" | "async", unknown, Record<string, unknown>>,
    "$count" | "select" | "delete"
  >;

  if (options.dryRun) {
    return {
      deletedCount: await queryDb.$count(syncBatchRequests, combinedWhere),
    };
  }

  if (options.limit !== undefined) {
    const toDelete = await queryDb
      .select()
      .from(syncBatchRequests)
      .where(combinedWhere)
      .limit(options.limit);

    if (toDelete.length === 0) {
      return { deletedCount: 0 };
    }

    for (const row of toDelete) {
      await queryDb
        .delete(syncBatchRequests)
        .where(eq(syncBatchRequests.id, row.id));
    }

    const sorted = [...toDelete].sort((a, b) => a.createdAt - b.createdAt);
    return {
      deletedCount: toDelete.length,
      oldestDeleted: String(sorted[0]!.createdAt),
      newestDeleted: String(sorted.at(-1)!.createdAt),
    };
  }

  const toDelete = await queryDb
    .select()
    .from(syncBatchRequests)
    .where(combinedWhere);

  if (toDelete.length === 0) {
    return { deletedCount: 0 };
  }

  await queryDb.delete(syncBatchRequests).where(combinedWhere);

  const sorted = [...toDelete].sort((a, b) => a.createdAt - b.createdAt);
  return {
    deletedCount: toDelete.length,
    oldestDeleted: String(sorted[0]!.createdAt),
    newestDeleted: String(sorted.at(-1)!.createdAt),
  };
}
