## Context

Baresync has an AI skill (`skills/baresync/`) that teaches coding agents how to use baresync. The skill is pure markdown (SKILL.md + 12 reference files). Users need a way to install it into their AI harness directory. The impeccable project has an identical feature (`npx impeccable skills install`) that we can learn from.

Current CLI entry point: `packages/baresync/src/cli.ts` (or `dist/cli.js`). Already handles `baresync generate`, `baresync doctor`, and `baresync check`.

## Goals / Non-Goals

**Goals:**
- `bunx baresync skills install` copies the skill to detected harness directories
- `bunx baresync skills update` refreshes installed skills to latest version
- Auto-detect harnesses in project dir, then home dir, then default fallback
- Interactive confirmation via clack with `--yes` bypass
- `--providers` flag for explicit targeting

**Non-Goals:**
- No compilation/per-harness variants (skill is universal markdown, unlike impeccable which compiles per-harness)
- No remote bundle download (skill ships inside the npm package)
- No `skills check` command (not needed for v1 — update is idempotent)
- No skill versioning/lock file (keep it simple for v1)

## Decisions

### 1. Skill files ship inside the npm package

**Decision**: Include `skills/baresync/` in the published npm package via `package.json` `files` array.

**Why**: Simpler than hosting a remote bundle. No API server needed. The skill is ~30KB of markdown. Users get the skill that matches their installed baresync version.

**Alternative considered**: Host on a CDN like impeccable. Rejected — adds infrastructure for no benefit since the skill is version-coupled to the package.

### 2. Universal skill (no per-harness compilation)

**Decision**: Copy the same markdown files to every harness. No harness-specific transforms.

**Why**: Unlike impeccable which compiles different SKILL.md variants per harness (different path placeholders, different tool schemas), baresync's skill is pure instructional markdown. All harnesses consume it the same way.

**Alternative considered**: Transform paths per harness (e.g., `.claude/skills/` vs `.cursor/skills/`). Rejected — the skill doesn't contain harness-specific paths.

### 3. Use clack for interactive prompts

**Decision**: Use clack (already in the monorepo via create-baresync) for the interactive confirmation prompt.

**Why**: Consistent UX with `npx create-baresync`. Clack is CLI-only code that gets tree-shaken from the runtime bundle — zero impact on app bundle size.

**Alternative considered**: Plain readline (like impeccable). Rejected — clack provides better UX with spinners and styled prompts, and it's already a known dependency.

### 4. Harness detection order

**Decision**: 
1. Check for harness dirs in project root (`.claude`, `.cursor`, `.gemini`, `.agents`, `.github`, `.kiro`, `.opencode`, `.pi`, `.qoder`, `.trae`, `.trae-cn`)
2. If none found, check globally installed harnesses in home dir (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`, `~/.kiro`, `~/.opencode`, `~/.qoder`)
3. If none found, default to `.claude` + `.agents`

**Why**: Matches impeccable's detection logic. Covers the common cases: project has harness dir, or user has a global harness installed.

### 5. File copy strategy

**Decision**: Use Node.js `fs.cpSync` with `{ recursive: true }` to copy `skills/baresync/` to each target.

**Why**: Simple, well-supported (Node 16+), handles nested directories. No need for a copy utility library.

**Alternative considered**: `execSync('cp -r ...')`. Rejected — not cross-platform (Windows).

## Risks / Trade-offs

- **[Risk]** User has custom edits in their skill files → update overwrites them. **Mitigation**: Always overwrite. The skill is version-coupled to baresync. If users want custom skills, they should use a different name. Add a warning in the output.
- **[Risk]** clack adds dependency weight. **Mitigation**: CLI-only, tree-shaken from runtime. Already in the monorepo.
- **[Risk]** Harness detection misses edge cases. **Mitigation**: `--providers` flag for explicit override. Default to `.claude` + `.agents` as safe fallback.

## Migration Plan

1. Add `skills/` to baresync's `package.json` `files` array
2. Add clack dependency
3. Implement `skills` subcommand in CLI
4. Test with `bunx baresync skills install` in a project with various harness dirs
5. Publish — users get the command with their next `bun add baresync` update

## Open Questions

None — the design is straightforward and well-proven by impeccable.
