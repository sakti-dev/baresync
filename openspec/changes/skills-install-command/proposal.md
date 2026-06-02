## Why

Baresync now has a comprehensive AI skill (`skills/baresync/`) that teaches coding agents how to use baresync correctly. But users have no way to install it into their preferred AI harness (Claude Code, Cursor, Gemini CLI, OpenCode, etc.). They'd have to manually copy files into the right directories. A CLI command can detect which harnesses the user has and install the skill automatically — same pattern as `npx impeccable skills install`.

## What Changes

- Add `bunx baresync skills install` CLI command
- Add `bunx baresync skills update` CLI command to refresh installed skills
- Auto-detect harness directories in the project (`.claude/`, `.cursor/`, `.gemini/`, `.agents/`, `.opencode/`, etc.)
- Fallback to globally installed harnesses in home dir (`~/.claude`, `~/.cursor`, etc.)
- Default to `.claude` + `.agents` if nothing detected
- Interactive confirmation using clack (already a dependency via create-baresync, safe because CLI code is tree-shaken from runtime bundle)
- Support `--yes` flag for non-interactive use
- Support `--providers=.claude,.cursor` flag to target specific harnesses
- Ship `skills/baresync/` inside the npm package

## Capabilities

### New Capabilities
- `skills-installer`: CLI command to detect AI harnesses and install/update the baresync skill into the correct directory structure

### Modified Capabilities

None — this is purely additive.

## Impact

- `packages/baresync/package.json`: add `skills/` to `files` array, add clack dependency
- `packages/baresync/src/cli.ts` (or `cli/` directory): add `skills` subcommand with `install`, `update`, `check` actions
- npm package size: adds ~30KB of markdown skill files + clack (CLI-only, tree-shaken from runtime)
