import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { syncOutbox } from "../schema/local-schema.js";

export interface SyncClientConfig {
  apiUrl: string;
  encoding: "json";
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  scopeId: string;
}

export interface PollingStatus {
  last_sync_at: string | null;
  paused: boolean;
  running: boolean;
}

export type LocalChangeOperation = "insert" | "update";

export interface LocalChangeOptions {
  operation: LocalChangeOperation;
  rowId: string;
  table: AnySQLiteTable;
}

export interface WriteLocalChangeOptions<TTx> extends LocalChangeOptions {
  write: (tx: TTx) => Promise<unknown> | unknown;
}

export interface SyncTransaction {
  insert(table: unknown): {
    values(values: Record<string, unknown>): Promise<unknown> | unknown;
  };
}

export interface SyncDatabase<TTx> {
  transaction<T>(callback: (tx: TTx) => Promise<T>): Promise<T>;
}

export interface SyncClient {
  enqueueChange<TTx extends SyncTransaction>(
    tx: TTx,
    options: LocalChangeOptions
  ): Promise<void>;
  fullResync(): Promise<unknown>;
  getPollingStatus(): Promise<PollingStatus>;
  getState(): Promise<{
    local_dirty_count: number;
    last_server_watermark: string;
    needs_baseline_sync: boolean;
  }>;
  pausePolling(): Promise<unknown>;
  pull(): Promise<unknown>;
  push(): Promise<unknown>;
  resumePolling(): Promise<unknown>;
  startPolling(): Promise<unknown>;
  stopPolling(): Promise<unknown>;
  syncNow(): Promise<unknown>;
  writeLocalChange<TTx extends SyncTransaction>(
    tx: TTx,
    options: WriteLocalChangeOptions<TTx>
  ): Promise<void>;
  writeTransaction<TTx, TResult>(
    db: SyncDatabase<TTx>,
    callback: (tx: TTx) => Promise<TResult>
  ): Promise<TResult>;
}

function createDefaultInvoke(): (
  cmd: string,
  args?: Record<string, unknown>
) => Promise<unknown> {
  return (cmd: string) =>
    Promise.reject(
      new Error(
        `Tauri IPC is not available. Cannot invoke "${cmd}". ` +
          "Provide a custom `invoke` function in createSyncClient config, " +
          "or run within a Tauri application."
      )
    );
}

function createOutboxId(input: {
  operation: LocalChangeOperation;
  rowId: string;
  tableName: string;
}) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `outbox-${input.operation}-${input.tableName}-${input.rowId}-${randomId}`;
}

function getSyncTableName(table: AnySQLiteTable): string {
  return getTableConfig(table).name;
}

export function createSyncClient(config: SyncClientConfig): SyncClient {
  const invoke = config.invoke ?? createDefaultInvoke();
  const scopeId = config.scopeId;

  return {
    async enqueueChange(tx, options) {
      const tableName = getSyncTableName(options.table);

      await tx.insert(syncOutbox).values({
        id: createOutboxId({
          operation: options.operation,
          rowId: options.rowId,
          tableName,
        }),
        tableName,
        rowId: options.rowId,
        operation: options.operation,
        scopeId,
        changedAt: new Date().toISOString(),
      });
    },
    syncNow() {
      return invoke("sync_now", { scopeId });
    },
    push() {
      return invoke("sync_push", { scopeId });
    },
    pull() {
      return invoke("sync_pull", { scopeId });
    },
    fullResync() {
      return invoke("sync_full_resync", { scopeId });
    },
    getState() {
      return invoke("get_sync_local_state", { scopeId }) as Promise<{
        local_dirty_count: number;
        last_server_watermark: string;
        needs_baseline_sync: boolean;
      }>;
    },
    startPolling() {
      return invoke("start_polling", { scopeId });
    },
    stopPolling() {
      return invoke("stop_polling");
    },
    pausePolling() {
      return invoke("pause_polling");
    },
    resumePolling() {
      return invoke("resume_polling");
    },
    getPollingStatus() {
      return invoke("get_polling_status") as Promise<PollingStatus>;
    },
    async writeLocalChange(tx, options) {
      await options.write(tx);
      await this.enqueueChange(tx, options);
    },
    writeTransaction(db, callback) {
      return db.transaction(callback);
    },
  };
}
