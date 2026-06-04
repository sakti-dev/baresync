## MODIFIED Requirements

### Requirement: Server integration modules

The scaffolder SHALL generate Baresync server integration in separate modules and minimally mount those modules into recognized server entrypoints.

The generated server route modules SHALL keep SQLite as the default backend and SHALL pass the generated server Drizzle database directly to the push handler as `idempotency: { db }`. The generated server route modules SHALL NOT import `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy` and SHALL NOT cast the server database through that type.

#### Scenario: Hono route module generated

- **WHEN** the user selects Hono
- **THEN** the scaffolder SHALL generate a Baresync sync route module exposing `/push`, `/pull`, and `/status` routes
- **AND** the generated server entrypoint SHALL mount those routes under `/sync` when the entrypoint shape is recognized
- **AND** the generated push route SHALL pass `idempotency: { db }` without a SQLite proxy cast

#### Scenario: Elysia route module generated

- **WHEN** the user selects Elysia
- **THEN** the scaffolder SHALL generate a Baresync sync route module exposing `/push`, `/pull`, and `/status` routes
- **AND** the generated server entrypoint SHALL mount those routes under `/sync` when the entrypoint shape is recognized
- **AND** the generated push route SHALL pass `idempotency: { db }` without a SQLite proxy cast

#### Scenario: Unrecognized server entrypoint fallback

- **WHEN** the scaffolder cannot safely patch the server entrypoint
- **THEN** it SHALL leave the generated entrypoint intact
- **AND** it SHALL print manual mount instructions for the generated sync route module

## ADDED Requirements

### Requirement: Server scaffold remains SQLite-first
The scaffolder SHALL continue to generate a SQLite-backed server by default using `better-sqlite3` and Drizzle's SQLite adapter.

#### Scenario: Server DB client uses SQLite
- **WHEN** the scaffolder writes `apps/server/src/db/client.ts`
- **THEN** the generated file SHALL create a SQLite database with `better-sqlite3`
- **AND** it SHALL export a Drizzle database created with `drizzle-orm/better-sqlite3`

#### Scenario: Server package includes SQLite compile dependencies
- **WHEN** the scaffolder writes or patches `apps/server/package.json`
- **THEN** the server package SHALL include the dependencies and dev dependencies required for the generated SQLite server DB client and TypeScript route code to compile

### Requirement: Server scaffold does not add alternate backend options
The scaffolder SHALL NOT prompt users to choose Postgres, MySQL, CockroachDB, or another server database backend as part of this change.

#### Scenario: User creates default project
- **WHEN** a user runs the scaffolder
- **THEN** the generated project SHALL use SQLite server defaults
- **AND** no server database backend selection prompt SHALL be shown
