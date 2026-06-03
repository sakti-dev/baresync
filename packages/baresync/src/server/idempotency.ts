import { and, eq, lt, ne, sql } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { syncBatchRequests } from "../schema/server-schema.js";

type DbLike = Parameters<SqliteRemoteDatabase["transaction"]>[0] extends (
  tx: infer T
) => Promise<unknown>
  ? T
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

async function loadPushBatchResponse(tx: DbLike, params: GuardParams) {
  const rows = await tx
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
  tx: DbLike,
  params: GuardParams
): Promise<void> {
  await tx.insert(syncBatchRequests).values({
    clientId: params.clientId,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    status: "pending",
    responseBody: '{"pending":true}',
    createdAt: Date.now(),
  });
}

async function finalizePushBatchResponse(
  tx: DbLike,
  params: GuardParams & { response: unknown }
): Promise<void> {
  await tx
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

export function createIdempotencyGuard({ db }: { db: SqliteRemoteDatabase }) {
  return {
    run<T>(
      params: GuardParams,
      callback: () => Promise<T>
    ): Promise<GuardResult<T>> {
      return db.transaction(async (tx) => {
        const existing = await loadPushBatchResponse(tx, params);

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
          if (existing.status === "pending") {
            throw new ConflictRequestError("sync push is already in progress");
          }
          throw new ConflictRequestError(
            "idempotency key already used with different request body"
          );
        }

        await reservePushBatchResponse(tx, params);

        const result = await callback();

        await finalizePushBatchResponse(tx, { ...params, response: result });

        return { result, wasReplay: false };
      });
    },
  };
}

export async function cleanupSyncBatchRequests(options: {
  db: SqliteRemoteDatabase;
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

  if (options.dryRun) {
    const rows = await options.db
      .select({ count: sql<number>`count(*)` })
      .from(syncBatchRequests)
      .where(combinedWhere);
    return { deletedCount: rows[0]?.count ?? 0 };
  }

  if (options.limit !== undefined) {
    const toDelete = await options.db
      .select()
      .from(syncBatchRequests)
      .where(combinedWhere)
      .limit(options.limit);

    if (toDelete.length === 0) {
      return { deletedCount: 0 };
    }

    for (const row of toDelete) {
      await options.db
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

  const toDelete = await options.db
    .select()
    .from(syncBatchRequests)
    .where(combinedWhere);

  if (toDelete.length === 0) {
    return { deletedCount: 0 };
  }

  await options.db.delete(syncBatchRequests).where(combinedWhere);

  const sorted = [...toDelete].sort((a, b) => a.createdAt - b.createdAt);
  return {
    deletedCount: toDelete.length,
    oldestDeleted: String(sorted[0]!.createdAt),
    newestDeleted: String(sorted.at(-1)!.createdAt),
  };
}
