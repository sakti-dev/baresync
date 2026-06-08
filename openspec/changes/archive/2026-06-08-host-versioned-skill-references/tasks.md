## 1. Baseline And Safety

- [x] 1.1 Read `proposal.md`, `design.md`, and all delta specs for `host-versioned-skill-references`.
- [x] 1.2 Run `git status --short` and identify any unrelated dirty files before editing.
- [x] 1.3 Run the existing skill installer tests: `bun test packages/baresync/src/skills/__test__/install.test.ts`.
- [x] 1.4 Run the current package artifact regression tests if present: `bun test packages/baresync/src/skills/__test__/package-install.test.ts`.
- [x] 1.5 Do not publish or tag during implementation; publishing requires a separate release step after verification.

## 2. RED: Package Artifact Regression Tests

- [x] 2.1 Add or update a test that creates a temporary package root with `skills/baresync/SKILL.md`, runs `npm pack --json --ignore-scripts`, and expects `skills/baresync/SKILL.md` in the packed file list.
- [x] 2.2 Add or update a test that runs `npm pack --json` from `packages/baresync`, extracts the tarball, runs `node <extract>/package/dist/cli/index.js skills install --yes --providers .claude,.agents,.opencode`, and verifies all target `SKILL.md` files plus `.opencode/commands/baresync.md`.
- [x] 2.3 Add an assertion that the normal packed artifact does not require `.pack/skills/baresync/SKILL.md` for success.
- [x] 2.4 Add an assertion that the packed bootstrap skill install does not require `skills/baresync/reference/**` inside the npm artifact.
- [x] 2.5 Run the new package artifact tests and confirm they fail before implementation if the package still depends on `.pack` or external skill staging.

## 3. GREEN: Package-Owned Bootstrap Skill

- [x] 3.1 Create `packages/baresync/skills/baresync/SKILL.md` as the canonical npm-bundled bootstrap skill.
- [x] 3.2 Make the bootstrap skill concise: include intent routing, version detection instructions, hosted manifest URL pattern, and fallback to workspace source when references cannot be fetched.
- [x] 3.3 Update `packages/baresync/package.json` so `files` includes `dist`, `skills`, `README.md`, and `LICENSE`, and does not require `.pack`.
- [x] 3.4 Remove package skill staging scripts from correctness paths: delete or stop using `packages/baresync/scripts/stage-skills.mjs` and `packages/baresync/scripts/clean-skills-pack.mjs`.
- [x] 3.5 Update `prepack`, `postpack`, and `pack:dry-run` scripts so packing builds the package but does not copy root-level `skills/baresync`.
- [x] 3.6 Update `scripts/publish.sh` so `npm publish --ignore-scripts` publishes the package-owned `skills/baresync/SKILL.md` without staging `.pack` or root-level reference files.

## 4. GREEN: Installer Source Resolution

- [x] 4.1 Update `packages/baresync/src/skills/install.ts` so packaged installs resolve `skills/baresync` directly from the installed package root.
- [x] 4.2 Keep workspace development installs working by resolving `packages/baresync/skills/baresync` or the package root layout when running from source.
- [x] 4.3 Remove `.pack/skills/baresync` as a required lookup path; keep it only as backwards-compatible tolerance if needed, not the primary path.
- [x] 4.4 Ensure `installSkills` copies only the bootstrap skill directory and still creates `.opencode/commands/baresync.md`.
- [x] 4.5 Update installer tests to expect bootstrap-only skill contents rather than bundled `reference/**`.

## 5. RED: Hosted Docs Reference Tests

- [x] 5.1 Add a test or script that validates `apps/docs/public/skills/baresync/0.4/manifest.json` exists and is valid JSON.
- [x] 5.2 Add validation that `apps/docs/public/skills/baresync/latest/manifest.json` exists and points to a concrete reference line.
- [x] 5.3 Add validation that every URL in each manifest's `references` object maps to an existing Markdown file under `apps/docs/public`.
- [x] 5.4 Add validation that each manifest declares compatible package ranges for `baresync`, `create-baresync`, `baresync-core`, and `tauri-plugin-baresync`.
- [x] 5.5 Run the hosted reference validation before creating files and confirm it fails because the docs public assets do not exist yet.

## 6. GREEN: Docs-Hosted Versioned References

- [x] 6.1 Create `apps/docs/public/skills/baresync/0.4/manifest.json`.
- [x] 6.2 Create `apps/docs/public/skills/baresync/0.4/reference/` and move or copy the current detailed reference Markdown files there.
- [x] 6.3 Create `apps/docs/public/skills/baresync/latest/manifest.json` and `latest/reference/` as the current alias, or document and implement a generation step that materializes it before docs build.
- [x] 6.4 Ensure manifest reference URLs are root-relative, for example `/skills/baresync/0.4/reference/server.md`.
- [x] 6.5 Ensure hosted references preserve current guidance for setup, server, schema, debug, testing, production, source routing, Tauri plugin, UI frameworks, and generator behavior.
- [x] 6.6 Update `apps/docs` docs pages if needed to mention that agent references are served under `/skills/baresync/<version>/`.

## 7. GREEN: Bootstrap Skill Version Routing

- [x] 7.1 Update the bootstrap `SKILL.md` to require agents to inspect `package.json`, lockfiles, `Cargo.toml`, or `Cargo.lock` for Baresync versions before loading detailed references.
- [x] 7.2 Define the reference URL pattern in the bootstrap skill: `/skills/baresync/<minor>/manifest.json`.
- [x] 7.3 Instruct agents to choose `0.4` for `0.4.x` packages and use `latest` only when version detection fails.
- [x] 7.4 Instruct agents to fetch only task-relevant reference files from the hosted manifest.
- [x] 7.5 Instruct agents to trust workspace source over hosted references if they conflict.
- [x] 7.6 Instruct agents to state when they fall back to `latest` or local source because a version-specific hosted reference cannot be loaded.

## 8. Cleanup Old Skill Source Shape

- [x] 8.1 Remove the root `skills/baresync` tree so it cannot be mistaken for canonical source.
- [x] 8.2 Update internal runbooks and references so they point to `packages/baresync/skills/baresync/SKILL.md` and hosted docs references.
- [x] 8.3 Keep local harness installations out of the package source-of-truth path.
- [x] 8.4 Remove references in docs, OpenSpec specs, and package scripts that treat root `skills/baresync` as the npm package source.
- [x] 8.5 Ensure no `packages/baresync/.pack` directory or tarball artifact remains after tests.

## 9. Verification

- [x] 9.1 Run `bun test packages/baresync/src/skills/__test__/install.test.ts`.
- [x] 9.2 Run `bun test packages/baresync/src/skills/__test__/package-install.test.ts`.
- [x] 9.3 Run the hosted reference validation test or script added in this change.
- [x] 9.4 Run `npm pack --json --ignore-scripts` against a staging package and confirm `skills/baresync/SKILL.md` appears in the file list.
- [x] 9.5 Run `npm pack --json` from `packages/baresync`, extract the tarball, and run the packed CLI install command against a temp project.
- [x] 9.6 Run `bun x ultracite check`.
- [x] 9.7 Run `bun run typecheck`.
- [x] 9.8 Run `openspec validate host-versioned-skill-references --strict`.
- [x] 9.9 Run `openspec status --change host-versioned-skill-references`.

## 10. Release Notes For Implementer

- [x] 10.1 After implementation is complete, bump to a new patch version because `0.4.1` was already published with a broken npm artifact.
- [x] 10.2 Before publishing, run `scripts/publish.sh` from a clean tree and inspect the npm package file list in its staging path or with `npm pack --dry-run`.
- [x] 10.3 After publishing, verify the registry artifact directly with `npm view baresync@<version> dist.tarball` and `tar -tf`.
- [x] 10.4 After publishing, run `bunx baresync@latest skills install --yes --providers .claude,.agents,.opencode` in a temp project and verify installed files.
