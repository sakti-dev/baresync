## Why

The current skill distribution model bundles the full Baresync reference corpus into the npm package, which has already failed through publish-path mismatches and makes installed agent guidance drift toward the CLI version instead of the consumer project's Baresync version.

We need a smaller, reliable bootstrap skill in the package and versioned reference payloads hosted by `apps/docs`, so agents can fetch guidance that matches the installed project version.

## What Changes

- Add docs-hosted, versioned Baresync skill reference payloads under `apps/docs/public/skills/baresync/`.
- Convert the npm-bundled Baresync skill into a bootstrap `SKILL.md` that tells agents how to detect project package/crate versions and fetch matching hosted references.
- Move the canonical packaged bootstrap skill into `packages/baresync/skills/baresync/SKILL.md` so npm publish includes it without copy/staging scripts.
- Stop publishing the full `reference/**` corpus inside the `baresync` npm package.
- Update the skills installer so `bunx baresync@latest skills install` installs the bootstrap skill reliably from the package root.
- Add regression tests for `npm pack --ignore-scripts` and the packed CLI install path so package publishing cannot silently drop the bootstrap skill again.
- Update skill guidance so agents treat hosted versioned references as detailed source material and use the installed `SKILL.md` only as routing/bootstrap guidance.

## Capabilities

### New Capabilities

- `hosted-skill-references`: Versioned Baresync skill reference payloads served by `apps/docs` for agents to fetch based on detected project versions.

### Modified Capabilities

- `skills-installer`: Change install/update behavior and package expectations from copying a full bundled reference corpus to copying a package-owned bootstrap skill.
- `baresync-skill-guidance`: Change the skill contract so detailed behavior is fetched from hosted versioned references after project version detection.

## Impact

- `apps/docs/public/skills/baresync/**` will serve static manifests and reference files.
- `packages/baresync/skills/baresync/SKILL.md` becomes the canonical bootstrap skill source for npm packaging.
- `packages/baresync/src/skills/install.ts` should resolve the package-owned bootstrap skill and no longer depend on `.pack` staging for correctness.
- `packages/baresync/package.json`, package scripts, and `scripts/publish.sh` should be simplified so `npm publish --ignore-scripts` still includes the bootstrap skill.
- Existing root `skills/baresync/**` content moves into docs-hosted versioned references and the root skill tree is removed.
- Tests must cover the packed artifact, not just workspace source files.
