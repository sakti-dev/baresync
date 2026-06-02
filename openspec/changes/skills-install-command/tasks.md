## 1. Package setup

- [x] 1.1 Add `skills/` directory to `files` array in `packages/baresync/package.json`
- [x] 1.2 Add `@clack/prompts` dependency to `packages/baresync/package.json`
- [x] 1.3 Run `bun install` to update lockfile

## 2. Skills install module

- [x] 2.1 Create `packages/baresync/src/skills/install.ts` with harness detection logic (project dir → home dir → default fallback)
- [x] 2.2 Implement `findProjectRoot()` — walk up from cwd looking for `.git`
- [x] 2.3 Implement `detectHarnesses(root)` — check for `.claude`, `.cursor`, `.gemini`, `.agents`, `.opencode`, etc.
- [x] 2.4 Implement `detectGlobalHarnesses()` — check `~/.claude`, `~/.codex`, `~/.cursor`, etc.
- [x] 2.5 Implement `installSkills(targets, skillSourceDir)` — copy skill files to each target harness dir
- [x] 2.6 Implement `updateSkills(targets, skillSourceDir)` — overwrite existing skill files

## 3. CLI integration

- [x] 3.1 Restructure CLI into `src/cli/` directory: `index.ts` (entry), `generator.ts` (doctor + generate), `skills.ts` (install + update)
- [x] 3.2 Parse `skills install`, `skills update` sub-commands with `--yes` and `--providers` flags
- [x] 3.3 Wire clack prompts for interactive confirmation (show detected harnesses, ask Y/n)
- [x] 3.4 Update `printUsage()` to include `skills` command

## 4. Verification

- [x] 4.1 Run `bun x ultracite check` — fix any lint/format issues
- [x] 4.2 Test `bunx baresync skills install` in a project with `.claude/` directory
- [x] 4.3 Test `bunx baresync skills install --yes` (non-interactive)
- [x] 4.4 Test `bunx baresync skills install --providers=.cursor` (explicit targeting)
- [x] 4.5 Test `bunx baresync skills update` overwrites existing files
- [x] 4.6 Verify skill files are included in `npm pack` output

## 5. Cleanup

- [x] 5.1 Move `src/__test__/cli.test.ts` → `src/cli/__test__/cli.test.ts` and update imports
- [x] 5.2 Move `src/__test__/skills.test.ts` → `src/skills/__test__/install.test.ts` and update imports
- [x] 5.3 Remove empty `src/__test__/` directory
