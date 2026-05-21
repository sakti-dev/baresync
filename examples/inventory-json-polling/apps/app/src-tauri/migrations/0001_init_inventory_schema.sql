CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  name TEXT NOT NULL,
  deleted_at TEXT,
  is_synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  deleted_at TEXT,
  is_synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  counted_quantity INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  deleted_at TEXT,
  is_synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT,
  scope_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_outbox_pending_row_unique
  ON sync_outbox (table_name, row_id)
  WHERE synced_at IS NULL;

CREATE TABLE IF NOT EXISTS sync_cursors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_id TEXT NOT NULL,
  last_cursor TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
