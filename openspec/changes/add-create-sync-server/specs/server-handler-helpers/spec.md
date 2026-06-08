## ADDED Requirements

### Requirement: Grouped batteries-included server factory

The `packages/baresync/src/server` export path SHALL provide `createSyncServer` as the preferred batteries-included factory for push, pull, and status sync routes. `createSyncServer` SHALL compose the existing server handler behavior and SHALL NOT introduce framework-specific request types.

#### Scenario: Grouped factory composes push, pull, and status handlers

- **WHEN** app code creates a grouped sync server with `db`, `resolveScope`, `push`, `pull`, and `status`
- **THEN** the grouped factory SHALL return `push`, `pull`, and `status` handlers with the same Web `Request`, app context, and Web `Response` contract as the standalone factories
- **AND** the grouped handlers SHALL preserve the existing push, pull, and status behavior

#### Scenario: Grouped factory shares scope resolver

- **WHEN** any grouped handler receives a sync request
- **THEN** it SHALL use the parent `resolveScope` callback
- **AND** route code SHALL NOT need to repeat `resolveScope` inside `push`, `pull`, or `status` options

#### Scenario: Grouped factory shares idempotency database at parent level

- **WHEN** grouped route code configures `createSyncServer`
- **THEN** it SHALL pass the idempotency-capable Drizzle database as parent option `db`
- **AND** it SHALL NOT pass `idempotency: { db }` inside `push`

### Requirement: Standalone factory deprecation contract

The existing standalone factories SHALL remain exported but SHALL be documented as deprecated for batteries-included route bundles.

#### Scenario: Standalone factories remain available

- **WHEN** existing app code imports `createSyncPushHandler`, `createSyncPullHandler`, or `createSyncStatusHandler` from `baresync/server`
- **THEN** the import SHALL continue to work
- **AND** existing behavior SHALL remain covered by tests

#### Scenario: Deprecation points to grouped and primitive APIs

- **WHEN** a developer reads the JSDoc for any standalone factory
- **THEN** the JSDoc SHALL say to use `createSyncServer` for batteries-included server routes
- **AND** it SHALL say to use exported server primitives directly for low-level custom routes
