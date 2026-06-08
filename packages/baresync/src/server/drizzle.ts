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
  /** Reads the most recent row (by `syncUpdatedAt`) for a given scope. */
  readLatestRow(input: { scopeId: string }): Promise<TReadRow | null>;
  /** Reads all rows changed since `cursorTimestamp` for a given scope. */
  readRows(input: {
    cursorTimestamp: number;
    scopeId: string;
  }): Promise<readonly TReadRow[]>;
  /** Marks a row as soft-deleted by setting `deletedAt`. */
  softDeleteRow(input: {
    id: string;
    syncUpdatedAt: number;
    updatedAt: string;
  }): Promise<void>;
  /** Inserts or updates a row. */
  upsertRow(row: TWriteRow): Promise<void>;
}

/** Options for {@link createDrizzleSyncRepository}. */
export interface DrizzleSyncRepositoryOptions<
  TTables extends Record<string, DrizzleSyncTableConfig>,
> {
  /** Map of table names to their sync configs. */
  tables: TTables;
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

async function readTableSnapshot<TReadRow extends DrizzleSyncReadRow>(input: {
  cursorTimestamp: number;
  scopeId: string;
  tableConfig: DrizzleSyncTableConfig<TReadRow, Record<string, unknown>>;
  tableName: string;
}): Promise<{
  bucket: SyncRowChangeBucket<unknown>;
  latestCursorRow: ReturnType<typeof latestCursorCandidate> | null;
}> {
  const latestRow = await input.tableConfig.readLatestRow({
    scopeId: input.scopeId,
  });
  const rows = await input.tableConfig.readRows({
    cursorTimestamp: input.cursorTimestamp,
    scopeId: input.scopeId,
  });

  const { changedRows, deletedIds } = splitSyncRows(rows);

  return {
    bucket: {
      changedRows,
      deletedIds,
    },
    latestCursorRow: latestRow
      ? latestCursorCandidate(latestRow, input.tableName)
      : null,
  };
}

async function readTableSnapshots<
  TTables extends Record<string, DrizzleSyncTableConfig>,
>(input: {
  cursorTimestamp: number;
  scopeId: string;
  tables: TTables;
}): Promise<{
  changes: Record<DrizzleSyncTableName<TTables>, SyncRowChangeBucket<unknown>>;
  latestCursorRows: ReturnType<typeof latestCursorCandidate>[];
}> {
  const tableNames = Object.keys(
    input.tables
  ) as DrizzleSyncTableName<TTables>[];
  const changes = {} as Record<
    DrizzleSyncTableName<TTables>,
    SyncRowChangeBucket<unknown>
  >;
  const latestCursorRows: ReturnType<typeof latestCursorCandidate>[] = [];

  for (const tableName of tableNames) {
    const tableConfig = input.tables[tableName];
    const result = await readTableSnapshot({
      cursorTimestamp: input.cursorTimestamp,
      scopeId: input.scopeId,
      tableConfig,
      tableName,
    });

    changes[tableName] = result.bucket;
    if (result.latestCursorRow) {
      latestCursorRows.push(result.latestCursorRow);
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
  cursorTimestamp: number;
  requestedTables: readonly string[];
  scopeId: string;
  tables: TTables;
}): Promise<DrizzleSyncPullResponse<DrizzleSyncTableName<TTables>>> {
  const { changes, latestCursorRows } = await readTableSnapshots({
    cursorTimestamp: input.cursorTimestamp,
    scopeId: input.scopeId,
    tables: input.tables,
  });
  const observedAt = nowMillis();
  const latestRow = latestCursorOrNull({ latestCursorRows });

  return {
    cursor: formatCursorOrWatermark({ latestRow, observedAt }),
    hasMore: false,
    serverTime: new Date(observedAt).toISOString(),
    tables: buildPullTables({
      allTables: Object.keys(input.tables) as DrizzleSyncTableName<TTables>[],
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

          await tableConfig.upsertRow(nextRow);
        }

        for (const id of change.deletedIds) {
          await tableConfig.softDeleteRow({
            id,
            syncUpdatedAt: input.syncUpdatedAt,
            updatedAt,
          });
        }
      }

      return buildPushAck(input.changes, tableNames);
    },

    loadPullChanges(input) {
      return buildPullResponse({
        cursorTimestamp: parseSyncCursorTimestamp(input.cursor),
        requestedTables: input.tables,
        scopeId: input.scopeId,
        tables: options.tables,
      });
    },

    async loadSyncStatus(input) {
      const cursorTimestamp = parseSyncCursorTimestamp(input.cursor);
      const { changes, latestCursorRows } = await readTableSnapshots({
        cursorTimestamp,
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
