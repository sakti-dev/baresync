## Context

Baresync currently treats the installed agent skill as a full local reference corpus. That model has two practical problems:

- The npm package root cannot naturally publish files that live outside `packages/baresync`, so every publish path needs custom copy/staging logic.
- The installed references are tied to the CLI package version used for `bunx baresync@latest skills install`, not necessarily the Baresync versions installed in the consumer project.

Recent publish failures exposed this directly: local pack flows could include staged skills, while `scripts/publish.sh` used `npm publish --ignore-scripts` from a custom staging directory and staged files under a path that `package.json` did not publish. The fix should remove this fragile shape rather than add more staging exceptions.

The intended model is:

```text
packages/baresync/skills/baresync/SKILL.md
  -> small bootstrap skill bundled in npm

apps/docs/public/skills/baresync/<version>/manifest.json
apps/docs/public/skills/baresync/<version>/reference/*.md
  -> detailed versioned references served by docs

apps/docs/public/skills/baresync/config.json
  -> repo-controlled docs domain and raw GitHub fallback configuration
```

## Goals / Non-Goals

**Goals:**

- Make `bunx baresync@latest skills install` reliable by installing a package-owned bootstrap `SKILL.md`.
- Serve detailed Baresync skill references from `apps/docs` as versioned static assets.
- Teach agents to detect the consumer project's Baresync package/crate versions before loading detailed guidance.
- Keep detailed guidance aligned to project version instead of latest CLI version.
- Remove `.pack` and cross-root skill staging as correctness requirements.
- Add regression tests that reproduce both normal `npm pack` and `scripts/publish.sh` style `npm publish --ignore-scripts` packaging.

**Non-Goals:**

- Do not build a dynamic reference API service. Static files in `apps/docs/public` are enough.
- Do not make network access mandatory for installing the bootstrap skill.
- Do not make the bootstrap `SKILL.md` a full copy of the detailed reference corpus.
- Do not solve historical broken npm releases; ship a new version after this change.

## Decisions

### Decision: Package-Owned Bootstrap Skill

The canonical packaged skill source SHALL live at:

```text
packages/baresync/skills/baresync/SKILL.md
```

`packages/baresync/package.json` SHALL publish:

```json
{
  "files": ["dist", "skills", "README.md", "LICENSE"]
}
```

The package SHALL NOT rely on `.pack` for correctness. The `prepack`, `postpack`, `stage-skills.mjs`, and `clean-skills-pack.mjs` skill-staging path should be removed or reduced to non-essential tooling.

Rationale: npm only publishes files inside the package root. A package-owned bootstrap file means `npm publish --ignore-scripts` still includes the skill.

Alternative considered: keep `skills/baresync` at the repo root and copy into `.pack`. This failed because every publish path must remember the same staging convention.

### Decision: Hosted References Under `apps/docs/public`

Detailed references SHALL be hosted as static files in the docs app:

```text
apps/docs/public/skills/baresync/config.json
apps/docs/public/skills/baresync/latest/manifest.json
apps/docs/public/skills/baresync/latest/reference/*.md
apps/docs/public/skills/baresync/0.4/manifest.json
apps/docs/public/skills/baresync/0.4/reference/*.md
```

The docs framework serves `public/**` as static assets, so these files can be fetched at:

```text
/skills/baresync/config.json
/skills/baresync/latest/manifest.json
/skills/baresync/0.4/manifest.json
```

Rationale: docs hosting already owns public Baresync documentation and can serve static versioned payloads without adding runtime infrastructure.

Alternative considered: fetch references from npm package contents. This keeps package size and publish correctness coupled to detailed docs.

### Decision: Minor-Version Reference Lines

Reference payloads SHOULD be organized by minor release line such as `0.4`, plus a `latest` alias.

The manifest SHOULD include compatibility metadata:

```json
{
  "name": "baresync",
  "referenceVersion": "0.4",
  "compatiblePackages": {
    "baresync": ">=0.4.0 <0.5.0",
    "create-baresync": ">=0.4.0 <0.5.0",
    "baresync-core": ">=0.4.0 <0.5.0",
    "tauri-plugin-baresync": ">=0.4.0 <0.5.0"
  },
  "references": {
    "setup": "/skills/baresync/0.4/reference/setup.md",
    "server": "/skills/baresync/0.4/reference/server.md",
    "debug": "/skills/baresync/0.4/reference/debug.md"
  }
}
```

Patch-specific reference lines MAY be added only when patch releases change agent-visible behavior.

Rationale: minor lines avoid unnecessary duplication while still preventing latest-version drift.

### Decision: Bootstrap Skill Performs Version Routing

The installed `SKILL.md` SHALL be concise and SHALL instruct agents to:

1. Detect installed package versions from local manifests:
   - `package.json` / lockfiles for `baresync` and `create-baresync`
   - `Cargo.toml` / `Cargo.lock` for `baresync-core` and `tauri-plugin-baresync`
2. Select the matching minor reference line.
3. Fetch repo-hosted config from `https://raw.githubusercontent.com/sakti-dev/baresync/main/apps/docs/public/skills/baresync/config.json`.
4. Build the hosted manifest URL from config values.
5. Fetch only the relevant reference files for the user intent.
6. If version detection fails, use `latest` and state that fallback explicitly.
7. If the docs URL fails, resolve the same manifest path against the raw GitHub fallback from config.

Example bootstrap guidance:

```md
Before answering detailed Baresync questions:

1. Detect the project's installed Baresync version.
2. Fetch the repo-hosted skill config.
3. Fetch `{docsBaseUrl}{referencesBasePath}/<minor>/manifest.json`.
4. If docs hosting fails, fetch `{fallbackRawBaseUrl}/<minor>/manifest.json`.
5. Load only the referenced files needed for the user's task.
6. Trust workspace source over hosted references if they conflict.
```

Rationale: this keeps installed skill content stable and small while making detailed behavior version-aware.

### Decision: Preserve Offline Install, Not Offline Detailed Reference

`bunx baresync@latest skills install` SHALL work without network access beyond npm package retrieval. The installed bootstrap skill SHALL be useful enough to tell agents how to proceed, but detailed references MAY require network access to the docs host.

If hosted references cannot be fetched, the bootstrap skill SHALL instruct agents to inspect local workspace source and package docs rather than hallucinate.

## Risks / Trade-offs

- Hosted docs unavailable -> Agents may not fetch detailed references. Mitigation: bootstrap skill includes fallback routing to local source inspection and workspace manifests.
- Reference line missing for a project version -> Agents may choose `latest` incorrectly. Mitigation: manifests declare compatibility ranges, and docs build/release tasks require creating the current minor line.
- Root `skills/baresync` users lose local full reference path -> Mitigation: remove it explicitly and route package installs through `packages/baresync/skills/baresync/SKILL.md` plus hosted references.
- Package install tests become slower -> Mitigation: keep the expensive packed-tarball test scoped to `packages/baresync/src/skills/__test__/package-install.test.ts`.
- Agents with no fetch tool may be limited -> Mitigation: bootstrap skill names exact local files to inspect as fallback and keeps enough intent routing to avoid blind answers.

## Migration Plan

1. Add the docs-hosted reference tree under `apps/docs/public/skills/baresync/0.4/`.
2. Add `latest` as a copy or generated alias for the current supported line.
3. Move current detailed references from `skills/baresync/reference/**` into the hosted docs tree and remove the root `skills/baresync` tree.
4. Create `packages/baresync/skills/baresync/SKILL.md` as the canonical bootstrap skill.
5. Update installer source resolution to prefer `packages/baresync/skills/baresync` in package installs and workspace source.
6. Simplify package scripts and `scripts/publish.sh` so no external skill staging is required.
7. Add tests for:
   - `npm pack --ignore-scripts` includes `skills/baresync/SKILL.md`
   - extracted package CLI installs bootstrap skill into `.claude`, `.agents`, and `.opencode`
   - installed bootstrap skill does not contain bundled `reference/**`
   - docs public manifest references existing files
8. Publish a new patch version after tests pass.

Rollback: restore the previous full bundled skill package layout and republish a new patch version. Existing docs-hosted references can remain as additional documentation.

## Open Questions

- What is the production docs origin? The implementation should use a configurable base URL or document the expected deployed domain, then use relative URLs inside manifests.
- Should `latest` be a physical copy or generated during docs build? Physical copy is simpler; generated alias avoids drift.
- Should the CLI support `baresync skills install --references=download` in the future to materialize hosted references locally? This change does not require it.
