import type { SyncPushChange } from "./handlers.js";
import {
  buildPullTables,
  changedTableNames,
  formatLatestSyncCursor,
  formatSyncWatermarkCursor,
  parseSyncCursorTimestamp,
  pickLatestSyncCursorRow,
  type SyncRowChangeBucket,
  splitSyncRows,
  validateSyncTable,
} from "./service.js";

/**
 * Asserts that a value is a string, returning it narrowed to `string`.
 *
 * Use for columns that are always present (e.g. `id`, `name`).
 * Throws at runtime if the value is not a string — typically a schema mismatch
 * or a bug in the mapping code.
 *
 * @param value - The raw column value from a Drizzle `.values()` row.
 * @param label - A human-readable column identifier (e.g. `"locations.id"`)
 *   included in the error message to aid debugging.
 *
 * @example
 * ```ts
 * id: requiredString(row.id, "locations.id"),
 * ```
 */
export function requiredString(value: unknown, label: string): string {
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Expected ${label} to be a string`);
}

/**
 * Narrows a value to `string | null`.
 *
 * Use for nullable columns (e.g. `deletedAt`, `sku`).
 * Returns `null` when the value is not a string instead of throwing.
 *
 * @param value - The raw column value from a Drizzle `.values()` row.
 *
 * @example
 * ```ts
 * deletedAt: optionalString(row.deletedAt),
 * ```
 */
export function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Asserts that a value is a finite number, returning it narrowed to `number`.
 *
 * Use for numeric columns that are always present (e.g. `quantity`, `price`).
 * Throws at runtime if the value is not a finite number — typically a schema
 * mismatch or a bug in the mapping code. `NaN` and `Infinity` are rejected.
 *
 * @param value - The raw column value from a Drizzle `.values()` row.
 * @param label - A human-readable column identifier (e.g. `"items.quantity"`)
 *   included in the error message to aid debugging.
 *
 * @example
 * ```ts
 * quantity: requiredNumber(row.quantity, "items.quantity"),
 * ```
 */
export function requiredNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Expected ${label} to be a finite number`);
}

/**
 * A drizzle query builder for one sync statement.
 *
 * Query builders are thenable — awaiting one executes the statement, which is
 * the sequential fallback path for dialects whose driver has no `db.batch`
 * (e.g. better-sqlite3). They are also batchable: dialects with a batch
 * session (libsql, d1, …) accept builders directly in `db.batch`, collapsing
 * every statement of one sync operation into a single HTTP subrequest.
 * Cloudflare Workers cap subrequests at 50 per invocation; the batched path
 * is what keeps `/status` (2 statements × N tables) under that cap.
 */
export type SyncQuery<T> = PromiseLike<T> & { getSQL(): unknown };

/**
 * Shape of a row returned by `DrizzleSyncTableConfig.readRows` and `readLatestRow`.
 *
 * Every sync table must return at least these columns so the sync engine can
 * track changes and handle soft deletes.
 */
export interface DrizzleSyncReadRow {
  deletedAt: string | null;
  id: string;
  syncUpdatedAt: number;
  updatedAt: string;
}

/**
 * Configuration object that adapts a Drizzle ORM table for use with the sync engine.
 *
 * Implement this interface to tell the sync helper how to read, write, and
 * soft-delete rows for a single table. Pass an array of these configs to
 * {@link createDrizzleSyncHandler}.
 *
 * @typeParam TReadRow - The row shape returned by `readRows` / `readLatestRow`.
 *   Must extend {@link DrizzleSyncReadRow}. Defaults to `DrizzleSyncReadRow`.
 * @typeParam TWriteRow - The row shape accepted by `upsertRow` and `buildRow`.
 *   Defaults to `Record<string, unknown>`.
 */
export interface DrizzleSyncTableConfig<
  TReadRow extends DrizzleSyncReadRow = DrizzleSyncReadRow,
  TWriteRow extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Transforms a raw sync row from the client into a row ready for upsert.
   * Use the `requiredString` / `optionalString` / `requiredNumber` helpers to
   * narrow the `unknown` column values.
   */
  buildRow(input: {
    /** Raw column values from the sync push payload. */
    row: Record<string, unknown>;
    /** The scope (e.g. tenant) this row belongs to. */
    scopeId: string;
    /** Server-assigned monotonic timestamp for this sync cycle. */
    syncUpdatedAt: number;
    /** ISO timestamp for this sync cycle. */
    updatedAt: string;
  }): TWriteRow;
  /** Returns the builder reading the most recent row (by `syncUpdatedAt`) for a scope. The repository takes `rows[0] ?? null`. */
  readLatestRow(input: { scopeId: string }): SyncQuery<TReadRow[]>;
  /** Returns the builder reading all rows changed since `cursorTimestamp` for a scope. */
  readRows(input: {
    cursorTimestamp: number;
    scopeId: string;
  }): SyncQuery<TReadRow[]>;
  /** Returns the builder marking a row as soft-deleted by setting `deletedAt`. */
  softDeleteRow(input: {
    id: string;
    syncUpdatedAt: number;
    updatedAt: string;
  }): SyncQuery<unknown>;
  /** Returns the builder inserting or updating a row. */
  upsertRow(row: TWriteRow): SyncQuery<unknown>;
}

/** Options for {@link createDrizzleSyncRepository}. */
export interface DrizzleSyncRepositoryOptions<
  TTables extends Record<string, DrizzleSyncTableConfig>,
> {
  /** Map of table names to their sync configs. */
  tables: TTables;
  /**
   * The Drizzle database handle. Strongly recommended: when the dialect
   * exposes `db.batch` (libsql, d1, …) every sync operation executes all its
   * statements as ONE batched call — one HTTP subrequest on remote drivers.
   * Cloudflare Workers cap subrequests at 50 per invocation, and a per-table
   * sequential snapshot issues two queries per table per request; without
   * batching, large table registries die mid-request. Without `db`, each
   * returned builder is awaited one by one (identical results, more round
   * trips).
   */
  db?: unknown;
}

function batchFn(
  db: unknown
): ((queries: unknown[]) => Promise<unknown[]>) | null {
  const candidate = db as { batch?: unknown } | undefined;
  if (typeof candidate?.batch !== "function") {
    return null;
  }
  // Bind to the db handle: `batch` is a method that reads `this.session`
  // internally — extracting it unbound throws
  // "Cannot read properties of undefined (reading 'session')" at call time.
  const bound = candidate.batch as (queries: unknown[]) => Promise<unknown[]>;
  return (queries: unknown[]) => bound.call(candidate, queries);
}

/**
 * Execute sync statements in collection order via one driver call when the
 * dialect supports batching, otherwise by awaiting each builder.
 */
async function runSyncStatements(
  db: unknown,
  queries: SyncQuery<unknown>[]
): Promise<unknown[]> {
  if (queries.length === 0) {
    return [];
  }
  const batch = batchFn(db);
  if (batch) {
    return await batch(queries);
  }
  const results: unknown[] = [];
  for (const query of queries) {
    results.push(await query);
  }
  return results;
}

/** Extracts the string table names from a `TTables` map. */
export type DrizzleSyncTableName<
  TTables extends Record<string, DrizzleSyncTableConfig>,
> = Extract<keyof TTables, string>;

/**
 * Response returned by {@link DrizzleSyncRepository.loadPullChanges}.
 *
 * @typeParam TTableName - Union of table name literals.
 */
export interface DrizzleSyncPullResponse<TTableName extends string> {
  cursor: string;
  hasMore: false;
  serverTime: string;
  tables: Array<{
    changedRows: unknown[];
    deletedIds: string[];
    table: TTableName;
  }>;
}

/**
 * Response returned by {@link DrizzleSyncRepository.applyPushChanges}.
 *
 * @typeParam TTableName - Union of table name literals.
 */
export interface DrizzleSyncPushResponse<TTableName extends string> {
  serverTime: string;
  tables: Array<{
    acceptedCreatedIds: string[];
    acceptedDeletedIds: string[];
    acceptedUpdatedIds: string[];
    rejected: Array<{ id: string; reason: string }>;
    table: TTableName;
  }>;
}

/**
 * Response returned by {@link DrizzleSyncRepository.loadSyncStatus}.
 *
 * @typeParam TTableName - Union of table name literals.
 */
export interface DrizzleSyncStatusResponse<TTableName extends string> {
  changedTables: TTableName[];
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
}

/**
 * A Drizzle-backed sync repository created by {@link createDrizzleSyncRepository}.
 *
 * Provides push, pull, and status operations over a set of configured tables.
 *
 * @typeParam TTables - The table config map passed at creation.
 */
export interface DrizzleSyncRepository<
  TTables extends Record<string, DrizzleSyncTableConfig>,
> {
  applyPushChanges(input: {
    changes: readonly SyncPushChange[];
    scopeId: string;
    syncUpdatedAt: number;
  }): Promise<DrizzleSyncPushResponse<DrizzleSyncTableName<TTables>>>;
  loadPullChanges(input: {
    cursor: string;
    scopeId: string;
    tables: readonly string[];
  }): Promise<DrizzleSyncPullResponse<DrizzleSyncTableName<TTables>>>;
  loadSyncStatus(input: {
    cursor: string;
    scopeId: string;
  }): Promise<DrizzleSyncStatusResponse<DrizzleSyncTableName<TTables>>>;
  readonly tableNames: readonly DrizzleSyncTableName<TTables>[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function latestCursorCandidate(
  row: DrizzleSyncReadRow,
  tableName: string
): {
  id: string;
  syncUpdatedAt: number;
  tableName: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    syncUpdatedAt: row.syncUpdatedAt,
    tableName,
    updatedAt: row.updatedAt,
  };
}

interface TableSnapshotPlan {
  tableName: string;
  latestIndex: number;
  rowsIndex: number;
}

/**
 * Plan one builder per read across all tables, IN REGISTRY ORDER — the batch
 * executes statements sequentially, so FK-safe table order is preserved.
 */
function planTableSnapshots<TTables extends Record<string, DrizzleSyncTableConfig>>(
  input: { scopeId: string; cursorTimestamp: number; tables: TTables },
  queries: SyncQuery<unknown>[]
): TableSnapshotPlan[] {
  return (Object.keys(input.tables) as DrizzleSyncTableName<TTables>[]).map(
    (tableName) => {
      const config = input.tables[tableName];
      const latestIndex = queries.length;
      queries.push(config.readLatestRow({ scopeId: input.scopeId }));
      const rowsIndex = queries.length;
      queries.push(
        config.readRows({
          cursorTimestamp: input.cursorTimestamp,
          scopeId: input.scopeId,
        })
      );
      return { tableName, latestIndex, rowsIndex };
    }
  );
}

async function readTableSnapshots<
  TTables extends Record<string, DrizzleSyncTableConfig>,
>(input: {
  db: unknown;
  cursorTimestamp: number;
  scopeId: string;
  tables: TTables;
}): Promise<{
  changes: Record<DrizzleSyncTableName<TTables>, SyncRowChangeBucket<unknown>>;
  latestCursorRows: ReturnType<typeof latestCursorCandidate>[];
}> {
  const queries: SyncQuery<unknown>[] = [];
  const plans = planTableSnapshots(input, queries);
  const results = await runSyncStatements(input.db, queries);

  const changes = {} as Record<
    DrizzleSyncTableName<TTables>,
    SyncRowChangeBucket<unknown>
  >;
  const latestCursorRows: ReturnType<typeof latestCursorCandidate>[] = [];

  for (const plan of plans) {
    const latestRows = results[plan.latestIndex] as unknown[];
    const rows = results[plan.rowsIndex] as DrizzleSyncReadRow[];
    changes[plan.tableName as DrizzleSyncTableName<TTables>] =
      splitSyncRows(rows);
    const latestRow = latestRows[0] ?? null;
    if (latestRow) {
      latestCursorRows.push(
        latestCursorCandidate(latestRow as DrizzleSyncReadRow, plan.tableName)
      );
    }
  }

  return { changes, latestCursorRows };
}

function nowMillis(): number {
  return Date.now();
}

function formatCursorOrWatermark(input: {
  latestRow: ReturnType<typeof latestCursorCandidate> | null;
  observedAt: number;
}): string {
  return input.latestRow
    ? formatLatestSyncCursor(input.latestRow)
    : formatSyncWatermarkCursor(input.observedAt);
}

function latestCursorOrNull(input: {
  latestCursorRows: ReturnType<typeof latestCursorCandidate>[];
}): ReturnType<typeof latestCursorCandidate> | null {
  return pickLatestSyncCursorRow(input.latestCursorRows);
}

function buildPushAck<TTableName extends string>(
  changes: readonly SyncPushChange[],
  tableNames: readonly TTableName[]
): DrizzleSyncPushResponse<TTableName> {
  return {
    serverTime: nowIso(),
    tables: changes.map((change) => {
      const table = validateSyncTable(change.table, tableNames);

      return {
        acceptedCreatedIds: [],
        acceptedDeletedIds: change.deletedIds,
        acceptedUpdatedIds: change.changedRows
          .map((row) => asRecord(row).id)
          .filter((id): id is string => typeof id === "string"),
        rejected: [],
        table,
      };
    }),
  };
}

async function buildPullResponse<
  TTables extends Record<string, DrizzleSyncTableConfig>,
>(input: {
  db: unknown;
  cursorTimestamp: number;
  requestedTables: readonly string[];
  scopeId: string;
  tables: TTables;
}): Promise<DrizzleSyncPullResponse<DrizzleSyncTableName<TTables>>> {
  // Only build statements for tables the device actually requested — every
  // builder still costs a statement inside the batch, and filtered pulls
  // (status → changedTables → pull subset) previously read ALL tables. An
  // empty request reads every table (baseline pull). The cursor is computed
  // over the tables actually read: it advances conservatively, so tables
  // left out of a filtered pull stay flagged for the next status instead of
  // being skipped by a global watermark.
  const requestedNames = new Set(input.requestedTables);
  const tables: TTables =
    input.requestedTables.length > 0
      ? (Object.keys(input.tables) as DrizzleSyncTableName<TTables>[]).reduce<
          TTables
        >((picked, name) => {
          if (requestedNames.has(name)) {
            picked[name] = input.tables[name];
          }
          return picked;
        }, {} as TTables)
      : input.tables;

  const { changes, latestCursorRows } = await readTableSnapshots({
    cursorTimestamp: input.cursorTimestamp,
    db: input.db,
    scopeId: input.scopeId,
    tables,
  });
  const observedAt = nowMillis();
  const latestRow = latestCursorOrNull({ latestCursorRows });

  return {
    cursor: formatCursorOrWatermark({ latestRow, observedAt }),
    hasMore: false,
    serverTime: new Date(observedAt).toISOString(),
    tables: buildPullTables({
      allTables: Object.keys(tables) as DrizzleSyncTableName<TTables>[],
      changes,
      requestedTables: input.requestedTables,
    }),
  };
}

/**
 * Creates a Drizzle-backed sync repository from a set of table configs.
 *
 * This is the main entry point for the Drizzle sync helper. Pass it a map of
 * table names → {@link DrizzleSyncTableConfig} implementations, and it returns
 * a {@link DrizzleSyncRepository} with `applyPushChanges`, `loadPullChanges`,
 * and `loadSyncStatus` methods ready to wire into your sync routes.
 *
 * @typeParam TTables - A map of table names to their configs.
 *
 * @example
 * ```ts
 * const repo = createDrizzleSyncRepository({
 *   tables: { locations, items, stock_counts },
 * });
 * ```
 */
export function createDrizzleSyncRepository<
  TTables extends Record<string, DrizzleSyncTableConfig>,
>(
  options: DrizzleSyncRepositoryOptions<TTables>
): DrizzleSyncRepository<TTables> {
  const tableNames = Object.keys(
    options.tables
  ) as DrizzleSyncTableName<TTables>[];

  return {
    tableNames,

    async applyPushChanges(input) {
      const updatedAt = new Date(input.syncUpdatedAt).toISOString();

      // buildRow validation runs BEFORE any statement is collected — a
      // malformed row rejects the whole chunk with zero partial writes.
      const statements: SyncQuery<unknown>[] = [];
      for (const change of input.changes) {
        const tableName = validateSyncTable(change.table, tableNames);
        const tableConfig = options.tables[tableName];

        for (const row of change.changedRows) {
          const nextRow = tableConfig.buildRow({
            row: asRecord(row),
            scopeId: input.scopeId,
            syncUpdatedAt: input.syncUpdatedAt,
            updatedAt,
          });

          statements.push(tableConfig.upsertRow(nextRow));
        }

        for (const id of change.deletedIds) {
          statements.push(
            tableConfig.softDeleteRow({
              id,
              syncUpdatedAt: input.syncUpdatedAt,
              updatedAt,
            })
          );
        }
      }

      await runSyncStatements(options.db, statements);

      return buildPushAck(input.changes, tableNames);
    },

    loadPullChanges(input) {
      return buildPullResponse({
        cursorTimestamp: parseSyncCursorTimestamp(input.cursor),
        db: options.db,
        requestedTables: input.tables,
        scopeId: input.scopeId,
        tables: options.tables,
      });
    },

    async loadSyncStatus(input) {
      const cursorTimestamp = parseSyncCursorTimestamp(input.cursor);
      const { changes, latestCursorRows } = await readTableSnapshots({
        cursorTimestamp,
        db: options.db,
        scopeId: input.scopeId,
        tables: options.tables,
      });
      const changedTables = changedTableNames({
        allTables: tableNames,
        changes,
      });
      const observedAt = nowMillis();
      const latestRow = latestCursorOrNull({ latestCursorRows });

      return {
        changedTables,
        hasChanges: changedTables.length > 0,
        cursor: formatCursorOrWatermark({ latestRow, observedAt }),
        serverTime: new Date(observedAt).toISOString(),
      };
    },
  };
}
