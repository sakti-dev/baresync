## ADDED Requirements

### Requirement: Skills prefer grouped server API

The Baresync skill guidance SHALL teach agents to use `createSyncServer` as the preferred batteries-included server route API for new or updated push, pull, and status route bundles.

#### Scenario: Agent wires new server routes

- **WHEN** an agent is helping a consumer create Baresync server routes
- **THEN** the skill guidance SHALL instruct the agent to import `createSyncServer` from `baresync/server`
- **AND** configure parent-level `db` and shared `resolveScope`
- **AND** configure nested `push`, `pull`, and `status` operation callbacks

### Requirement: Skills document raw request ownership

The Baresync skill guidance SHALL warn agents that Baresync handlers must receive the original raw Web `Request` before framework body parsing consumes the request stream.

#### Scenario: Agent wires Hono routes

- **WHEN** an agent writes or reviews Hono sync routes
- **THEN** the skill guidance SHALL instruct the agent to pass `c.req.raw` directly to `syncServer.push`, `syncServer.pull`, and `syncServer.status`
- **AND** the guidance SHALL warn against calling `c.req.json()`, `c.req.text()`, or `c.req.parseBody()` before Baresync

#### Scenario: Agent wires Elysia routes

- **WHEN** an agent writes or reviews Elysia sync routes
- **THEN** the skill guidance SHALL instruct the agent to pass the original `request` directly to `syncServer.push`, `syncServer.pull`, and `syncServer.status`
- **AND** the guidance SHALL instruct the agent to configure Elysia routes so the framework does not parse the body before Baresync
- **AND** the guidance SHALL reject `new Request(..., { body: JSON.stringify(c.body) })` as the preferred solution

#### Scenario: Agent explains idempotency byte semantics

- **WHEN** an agent documents or debugs sync push idempotency
- **THEN** the skill guidance SHALL explain that Baresync computes `requestHash` from raw request bytes
- **AND** the guidance SHALL warn that reconstructed requests can alter byte identity and idempotency conflict behavior

### Requirement: Skills enumerate grouped API blast radius

The Baresync skill guidance SHALL update all relevant source-routing and reference files that currently teach the grouped server route shape.

#### Scenario: Agent loads server reference

- **WHEN** an agent loads `skills/baresync/reference/server.md` or `packages/baresync/skills/reference/server.md`
- **THEN** the primary route example SHALL use `createSyncServer`
- **AND** it SHALL include raw request guidance for Hono and Elysia

#### Scenario: Agent loads source and verification references

- **WHEN** an agent loads source, generator, testing, or verification references
- **THEN** references to server route wiring SHALL point to `createSyncServer` as the preferred grouped API
- **AND** low-level primitives SHALL be reserved for custom protocol routes

