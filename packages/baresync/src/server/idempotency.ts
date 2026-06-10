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
    run: <T>(
      params: GuardParams,
      callback: () => Promise<T>
    ): Promise<GuardResult<T>> =>
      runGuard(db, pendingTimeoutMs, params, callback),
  };
}

async function runGuard<T>(
  db: unknown,
  pendingTimeoutMs: number,
  params: GuardParams,
  callback: () => Promise<T>
): Promise<GuardResult<T>> {
  const existing = await loadPushBatchResponse(db, params);

  const resolved = await resolveExistingRow(
    db,
    pendingTimeoutMs,
    params,
    existing
  );
  if (resolved) {
    return resolved as GuardResult<T>;
  }

  if (!existing) {
    const recovered = await reserveWithRecovery(db, params);
    if (recovered) {
      return recovered as GuardResult<T>;
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
}

/** Returns a GuardResult if the row resolves to a replay/conflict, null to proceed. */
async function resolveExistingRow(
  db: unknown,
  pendingTimeoutMs: number,
  params: GuardParams,
  existing: SyncBatchRequestRow | null
): Promise<GuardResult<unknown> | null> {
  if (!existing) {
    return null;
  }

  if (existing.status === "completed") {
    if (existing.requestHash === params.requestHash) {
      return {
        result: JSON.parse(existing.responseBody!),
        wasReplay: true,
      };
    }
    throw new ConflictRequestError(
      "idempotency key already used with different request body"
    );
  }

  if (existing.status === "pending") {
    const age = Date.now() - existing.createdAt;
    if (age < pendingTimeoutMs) {
      throw new ConflictRequestError("sync push is already in progress");
    }
    // Stale — reclaim via UPDATE in-place, row stays as pending
    await reclaimStalePendingRow(db, params);
  }

  return null;
}

/** INSERT reserve row; on UNIQUE conflict, re-read and return replay/conflict. */
async function reserveWithRecovery(
  db: unknown,
  params: GuardParams
): Promise<GuardResult<unknown> | null> {
  try {
    await reservePushBatchResponse(db, params);
    return null;
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
        result: JSON.parse(reloaded.responseBody!),
        wasReplay: true,
      };
    }
    if (reloaded.status === "completed") {
      throw new ConflictRequestError(
        "idempotency key already used with different request body"
      );
    }
    throw new ConflictRequestError("sync push is already in progress");
  }
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
