## Context

Baresync is published and packageable, but it still lacks one end-to-end consumer example that shows how the public npm package, the Rust plugin crate, and the shared sync contract fit together. The repository already contains docs examples and fixture code, but they read like integration snippets rather than a complete application.

This change introduces one canonical inventory example that is intended to be copied and adapted. The example must stay single-scope and avoid multi-tenant language so it remains easy to understand for individual app developers.

## Goals / Non-Goals

**Goals:**
- Provide one complete fullstack example that uses the published Baresync packages.
- Show a realistic but small inventory domain with a clear parent/child relationship.
- Demonstrate the intended repository shape for a consumer app, backend, and shared contract package.
- Keep the example single-user or single-scope rather than tenant-oriented.
- Make the example the primary quick-start path in docs and README guidance.

**Non-Goals:**
- Building a generic example framework or multiple domain examples.
- Adding authentication, multi-tenancy, billing, or workspace management.
- Introducing protobuf as the primary walkthrough path.
- Refactoring the main library APIs beyond what the example needs.

## Decisions

### One canonical example instead of several small examples
Use a single inventory example rather than separate app-only, server-only, or domain-specific samples. A single end-to-end sample better teaches the integration story and reduces maintenance overhead.

Alternatives considered:
- Multiple mini examples: easier to isolate, but harder to understand as a whole and easier to let drift.
- Todo app: too shallow and does not justify sync ordering or server ownership.

### Inventory domain with `locations`, `items`, and `stock_counts`
Choose inventory because it is concrete, easy to understand, and naturally shows local edits, parent/child relationships, and syncable state. It is also domain-neutral enough to avoid SaaS jargon.

Alternatives considered:
- CRM: adds business vocabulary and suggests multi-tenancy.
- Notes: simpler, but too small to demonstrate the value of sync ordering and server-backed persistence.

### Single-scope example with no tenant or workspace model
Model the example as a single-scope app, using a sync scope only as the technical partition required by Baresync. This keeps the documentation honest about the sync model without implying that the application itself is multi-tenant.

Alternatives considered:
- Tenant/workspace terminology: rejected because it shifts the example toward SaaS and away from a simple consumer app.

### Monorepo layout with `apps/app`, `apps/server`, and `packages/sync-contract`
Use a small workspace that mirrors how a real consumer would split responsibilities:
- `apps/app` for the Tauri client
- `apps/server` for the Elysia backend
- `packages/sync-contract` for the shared schema and generated artifacts

This keeps the contract shared and avoids duplicating schema definitions between frontend and backend.

Alternatives considered:
- Single-package example: simpler to scaffold, but it would blur the boundary between app, server, and shared contract.

### Public package names in the example
The example must import the published package names, not workspace-only paths. That makes the sample runnable for users outside the repository and prevents the docs from looking like internal scaffolding.

Alternatives considered:
- Keeping `@repo/baresync` in the example: rejected because it does not represent a real consumer workflow.

### JSON-first walkthrough
Start with JSON sync encoding in the main example docs. JSON is simpler to explain and aligns with the current public docs surface. Protobuf can be documented later as an advanced path.

Alternatives considered:
- Protobuf-first walkthrough: too much surface area for the first example.

## Risks / Trade-offs

- [Risk] The example can drift from the published package surface. → Mitigation: keep the example small and back it with smoke checks or docs verification.
- [Risk] The example may still feel abstract if the domain model is too thin. → Mitigation: include at least one parent/child relation and one fact table in the inventory schema.
- [Risk] A canonical example can become over-copied even if users need a different shape. → Mitigation: document the example as the starting point, not the only valid integration pattern.

## Migration Plan

No user migration is required. This change adds a new example workspace and updates documentation to point at it as the preferred starting point.

## Open Questions

- Should the first version include seed data for the inventory app, or stay focused on schema and sync flow only?
- Should the example include a minimal login placeholder, or remain fully local/single-scope with no auth story?
