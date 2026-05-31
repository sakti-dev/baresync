import type { SyncPushChange } from "./handlers.js";
import {
  buildPullTables,
  changedTableNames,
  formatLatestSyncCursor,
  parseSyncCursorTimestamp,
  pickLatestSyncCursorRow,
  type SyncRowChangeBucket,
  splitSyncRows,
  validateSyncTable,
} from "./service.js";

export function requiredString(value: unknown, label: string): string {
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Expected ${label} to be a string`);
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function requiredNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Expected ${label} to be a finite number`);
}

export interface DrizzleSyncReadRow {
  deletedAt: string | null;
  id: string;
  syncUpdatedAt: number;
  updatedAt: string;
}

export interface DrizzleSyncTableConfig<
  TReadRow extends DrizzleSyncReadRow = DrizzleSyncReadRow,
  TWriteRow extends Record<string, unknown> = Record<string, unknown>,
> {
  buildRow(input: {
    row: Record<string, unknown>;
    scopeId: string;
    syncUpdatedAt: number;
    updatedAt: string;
  }): TWriteRow;
  readLatestRow(input: { scopeId: string }): Promise<TReadRow | null>;
  readRows(input: {
    cursorTimestamp: number;
    scopeId: string;
  }): Promise<readonly TReadRow[]>;
  softDeleteRow(input: {
    id: string;
    syncUpdatedAt: number;
    updatedAt: string;
  }): Promise<void>;
  upsertRow(row: TWriteRow): Promise<void>;
}

export interface DrizzleSyncRepositoryOptions<
  TTables extends Record<string, DrizzleSyncTableConfig>,
> {
  tables: TTables;
}

export type DrizzleSyncTableName<
  TTables extends Record<string, DrizzleSyncTableConfig>,
> = Extract<keyof TTables, string>;

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

export interface DrizzleSyncStatusResponse<TTableName extends string> {
  changedTables: TTableName[];
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
}

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

function formatCursorOrEmpty(
  row: ReturnType<typeof latestCursorCandidate> | null
): string {
  return row ? formatLatestSyncCursor(row) : "";
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
  const latestRow = latestCursorOrNull({ latestCursorRows });

  return {
    cursor: formatCursorOrEmpty(latestRow),
    hasMore: false,
    serverTime: nowIso(),
    tables: buildPullTables({
      allTables: Object.keys(input.tables) as DrizzleSyncTableName<TTables>[],
      changes,
      requestedTables: input.requestedTables,
    }),
  };
}

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

      return {
        changedTables,
        hasChanges: changedTables.length > 0,
        cursor: formatCursorOrEmpty(latestCursorOrNull({ latestCursorRows })),
        serverTime: nowIso(),
      };
    },
  };
}
