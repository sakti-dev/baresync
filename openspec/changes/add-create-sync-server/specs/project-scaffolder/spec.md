## MODIFIED Requirements

### Requirement: Server integration modules

The scaffolder SHALL generate Baresync server integration in separate modules and minimally mount those modules into recognized server entrypoints.

The generated server route modules SHALL keep SQLite as the default backend and SHALL create one grouped Baresync sync server with `createSyncServer({ db, resolveScope, push, pull, status })`. The generated server route modules SHALL pass the generated server Drizzle database as the grouped parent `db`, SHALL NOT import `SqliteRemoteDatabase` from `drizzle-orm/sqlite-proxy`, SHALL NOT cast the server database through that type, and SHALL NOT reconstruct `Request` objects from parsed route bodies.

#### Scenario: Hono route module generated

- **WHEN** the user selects Hono
- **THEN** the scaffolder SHALL generate a Baresync sync route module exposing `/push`, `/pull`, and `/status` routes
- **AND** the generated server entrypoint SHALL mount those routes under `/sync` when the entrypoint shape is recognized
- **AND** the generated route module SHALL import `createSyncServer` from `baresync/server`
- **AND** the generated route module SHALL create one `syncServer` with parent-level `db` and shared `resolveScope`
- **AND** the generated Hono routes SHALL pass `c.req.raw` directly to `syncServer.push`, `syncServer.pull`, and `syncServer.status`

#### Scenario: Elysia route module generated

- **WHEN** the user selects Elysia
- **THEN** the scaffolder SHALL generate a Baresync sync route module exposing `/push`, `/pull`, and `/status` routes
- **AND** the generated server entrypoint SHALL mount those routes under `/sync` when the entrypoint shape is recognized
- **AND** the generated route module SHALL import `createSyncServer` from `baresync/server`
- **AND** the generated route module SHALL create one `syncServer` with parent-level `db` and shared `resolveScope`
- **AND** the generated Elysia routes SHALL pass the original `request` directly to `syncServer.push`, `syncServer.pull`, and `syncServer.status`
- **AND** the generated Elysia routes SHALL configure route parsing so Baresync does not consume the request body before it reads it

#### Scenario: Unrecognized server entrypoint fallback

- **WHEN** the scaffolder cannot safely patch the server entrypoint
- **THEN** it SHALL leave the generated entrypoint intact
- **AND** it SHALL print manual mount instructions for the generated sync route module

### Requirement: Scaffold template tests lock grouped server output

The create-baresync integration template tests SHALL assert the grouped server route shape for both Hono and Elysia generated output.

#### Scenario: Hono template test rejects standalone factories

- **WHEN** scaffold tests inspect the generated Hono `apps/server/src/v1/routes.ts`
- **THEN** they SHALL assert that the file contains `createSyncServer`
- **AND** they SHALL assert that the file contains parent-level `db,`, `push:`, `pull:`, and `status:`
- **AND** they SHALL assert that the file does not contain `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler`, or `idempotency: { db }`

#### Scenario: Elysia template test rejects reconstructed requests

- **WHEN** scaffold tests inspect the generated Elysia `apps/server/src/v1/routes.ts`
- **THEN** they SHALL assert that the file contains `createSyncServer`
- **AND** they SHALL assert that the file routes call `syncServer.push(request`, `syncServer.pull(request`, and `syncServer.status(request`
- **AND** they SHALL assert that the file configures parsing so Baresync receives the unread request body
- **AND** they SHALL assert that the file does not contain `new Request(` or `JSON.stringify(c.body)`

