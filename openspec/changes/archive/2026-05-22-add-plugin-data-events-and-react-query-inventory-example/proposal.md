## Why

The inventory example now reads SQLite through React components, but it still refreshes by blind interval polling. The plugin already knows when local data or sync status changes, so it should emit events that the frontend can use to invalidate React Query caches precisely.

## What Changes

- Add plugin event emission for local data changes and sync status changes.
- Emit data-change events only when local observable data actually changed, including SQL writes with affected rows, pull-applied rows/deletes, push-cleared outbox metadata, and full sync/resync changes.
- Preserve the existing `run_sql` command response shape while exposing affected-row metadata internally so event emission can be precise.
- Update the inventory example to use React Query for Drizzle reads and sync state.
- Replace interval polling in the inventory example with Tauri event listeners that invalidate React Query keys.
- Refactor inventory table components so data hooks own Drizzle/React Query and presentational tables receive rows and loading state.

## Capabilities

### New Capabilities

### Modified Capabilities
- `smart-polling`: Add plugin-emitted data-change and sync-status events for polling and sync activity.
- `tauri-plugin-builder`: Update plugin DB proxy command behavior to emit events based on successful affected-row changes while preserving command return values.
- `inventory-example`: Update the inventory example to teach React Query usage and event-driven invalidation instead of interval polling.

## Impact

- Affected Rust code: `crates/baresync-core/src/drizzle_proxy.rs`, `crates/tauri-plugin-baresync/src/builder.rs`, `crates/tauri-plugin-baresync/src/commands.rs`, `crates/tauri-plugin-baresync/src/polling.rs`, and plugin tests.
- Affected JS/example code: `examples/inventory-json-polling/apps/app` React app hooks, providers, components, and package dependencies.
- Affected APIs: new Tauri events `baresync://data-changed` and `baresync://sync-status-changed`; no breaking change to existing Tauri command response shapes.
- Testing impact: implementation must follow TDD with failing Rust tests for event emission and affected-row metadata before production changes, plus failing React tests or focused example tests for query invalidation and presentational table boundaries.
