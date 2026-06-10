import { sql } from "drizzle-orm";
import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { syncOutbox } from "../schema/local-schema.js";

export interface SyncClientConfig {
  commands?: SyncClientCommands;
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  scopeId: string;
}

export interface SyncClientCommands {
  fullResync?: string;
  getPollingStatus?: string;
  getState?: string;
  pausePolling?: string;
  pull?: string;
  push?: string;
  resumePolling?: string;
  setHeaders?: string;
  startPolling?: string;
  stopPolling?: string;
  syncNow?: string;
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

// biome-ignore lint/suspicious/noExplicitAny: generic default must be permissive for Drizzle ORM contravariance
export interface SyncTransaction<TColumn = any> {
  insert(table: unknown): {
    values(values: Record<string, unknown>): PromiseLike<unknown> & {
      onConflictDoUpdate(config: {
        target: TColumn | TColumn[];
        targetWhere?: unknown;
        set: Record<string, unknown>;
      }): Promise<unknown>;
    };
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
  setHeaders(headers: Record<string, string>): Promise<void>;
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
  const commands: Required<SyncClientCommands> = {
    syncNow: config.commands?.syncNow ?? "plugin:baresync|sync_now",
    push: config.commands?.push ?? "plugin:baresync|sync_push",
    pull: config.commands?.pull ?? "plugin:baresync|sync_pull",
    fullResync:
      config.commands?.fullResync ?? "plugin:baresync|sync_full_resync",
    getState:
      config.commands?.getState ?? "plugin:baresync|get_sync_local_state",
    startPolling:
      config.commands?.startPolling ?? "plugin:baresync|start_polling",
    stopPolling: config.commands?.stopPolling ?? "plugin:baresync|stop_polling",
    pausePolling:
      config.commands?.pausePolling ?? "plugin:baresync|pause_polling",
    resumePolling:
      config.commands?.resumePolling ?? "plugin:baresync|resume_polling",
    setHeaders: config.commands?.setHeaders ?? "plugin:baresync|set_headers",
    getPollingStatus:
      config.commands?.getPollingStatus ?? "plugin:baresync|get_polling_status",
  };

  return {
    async enqueueChange(tx, options) {
      const tableName = getSyncTableName(options.table);

      await tx
        .insert(syncOutbox)
        .values({
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
        })
        .onConflictDoUpdate({
          target: [syncOutbox.tableName, syncOutbox.rowId],
          targetWhere: sql`${syncOutbox.syncedAt} IS NULL`,
          set: {
            operation: sql`CASE WHEN ${syncOutbox.operation} = 'insert' THEN 'insert' ELSE ${options.operation} END`,
            changedAt: new Date().toISOString(),
          },
        });
    },
    syncNow() {
      return invoke(commands.syncNow, { scopeId });
    },
    push() {
      return invoke(commands.push, { scopeId });
    },
    pull() {
      return invoke(commands.pull, { scopeId });
    },
    fullResync() {
      return invoke(commands.fullResync, { scopeId });
    },
    getState() {
      return invoke(commands.getState, { scopeId }) as Promise<{
        local_dirty_count: number;
        last_server_watermark: string;
        needs_baseline_sync: boolean;
      }>;
    },
    startPolling() {
      return invoke(commands.startPolling, { scopeId });
    },
    stopPolling() {
      return invoke(commands.stopPolling);
    },
    pausePolling() {
      return invoke(commands.pausePolling);
    },
    resumePolling() {
      return invoke(commands.resumePolling);
    },
    setHeaders(headers: Record<string, string>): Promise<void> {
      return invoke(commands.setHeaders, { headers }) as Promise<void>;
    },
    getPollingStatus() {
      return invoke(commands.getPollingStatus) as Promise<PollingStatus>;
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
