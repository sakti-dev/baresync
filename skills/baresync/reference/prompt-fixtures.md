# Prompt Fixtures

Use these fixtures to sanity-check whether the skill routes a weaker agent correctly.

These are not automated tests by default. They are review prompts for skill behavior.

## Fixture 1: Exact API Type Question

Prompt:

```text
What does localSyncColumns return?
```

Expected behavior:

- Load `reference/query.md`.
- Then load `reference/source.md` because this is an exact API/type question.
- Inspect workspace source with `rg "localSyncColumns" packages/baresync/src`.
- Do not inspect `node_modules`.
- Explain return shape from source.

## Fixture 2: New User Setup

Prompt:

```text
I have a Tauri app and want local-first sync.
```

Expected behavior:

- Load `reference/setup.md`.
- Check prerequisites: Tauri 2.x, TypeScript server, Drizzle.
- If working in a repo, scan for `tauri-plugin-baresync` in `Cargo.toml`.
- Provide missing-piece checklist.

## Fixture 3: Generated Import Broken

Prompt:

```text
My server import @sync-contract/generated/2026-06-03/api-synced-schema fails.
```

Expected behavior:

- Load `reference/generator.md`.
- Check generated dated directory and snapshot files.
- Confirm path-based `apiSyncedSchema` and `localSyncedSchema`.
- Do not suggest `schemaSourceDir` for current API.

## Fixture 4: Outbox Stuck

Prompt:

```text
The outbox keeps growing and nothing syncs.
```

Expected behavior:

- Load `reference/debug.md`.
- Classify as push/outbox failure.
- Check server reachability, push route, auth/scope, and logs.
- Use `reference/verify.md` if integration may be incomplete.

## Fixture 5: Review Existing Integration

Prompt:

```text
Can you review my Baresync setup?
```

Expected behavior:

- Load `reference/verify.md`.
- Report findings first by severity.
- Check schema, generator, server, client writes, Tauri plugin, UI, and tests.
- Do not implement fixes unless asked.

## Fixture 6: Stale Skill Conflict

Prompt:

```text
The docs say one thing but the source seems different. Which is correct?
```

Expected behavior:

- Load `reference/source.md`.
- Trust workspace source.
- Mention stale-doc mismatch.
- Answer from source.
