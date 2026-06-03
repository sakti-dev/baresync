## ADDED Requirements

### Requirement: Install skill to detected harnesses
The CLI SHALL detect which AI harness directories exist in the project and copy the baresync skill into each one.

#### Scenario: Project has .claude directory
- **WHEN** user runs `bunx baresync skills install` and `.claude/` exists in the project root
- **THEN** the skill is copied to `.claude/skills/baresync/`

#### Scenario: Project has multiple harness directories
- **WHEN** user runs `bunx baresync skills install` and `.claude/`, `.cursor/`, `.opencode/` exist
- **THEN** the skill is copied to all three: `.claude/skills/baresync/`, `.cursor/skills/baresync/`, `.opencode/skills/baresync/`

#### Scenario: No harness directory in project
- **WHEN** user runs `bunx baresync skills install` and no harness directory exists in the project
- **THEN** the CLI checks for globally installed harnesses in the home directory (`~/.claude`, `~/.cursor`, etc.)
- **AND** copies the skill to matching global harness directories

#### Scenario: No harness detected anywhere
- **WHEN** user runs `bunx baresync skills install` and no harness is detected in project or home
- **THEN** the CLI defaults to installing into `.claude/skills/baresync/` and `.agents/skills/baresync/`

### Requirement: Interactive confirmation
The CLI SHALL ask for user confirmation before copying files, unless `--yes` is passed.

#### Scenario: User confirms installation
- **WHEN** the CLI detects harness directories and user has not passed `--yes`
- **THEN** the CLI displays the target directories and asks "Install baresync skill into N folder(s)? (Y/n)"
- **AND** proceeds if user presses Enter or types "y"

#### Scenario: User declines installation
- **WHEN** the CLI asks for confirmation and user types "n"
- **THEN** the CLI prints "Aborted." and exits with code 0

#### Scenario: Non-interactive mode
- **WHEN** user runs `bunx baresync skills install --yes`
- **THEN** the CLI skips the confirmation prompt and installs immediately

### Requirement: Explicit provider targeting
The CLI SHALL accept a `--providers` flag to override auto-detection.

#### Scenario: User specifies providers
- **WHEN** user runs `bunx baresync skills install --providers=.claude,.cursor`
- **THEN** the skill is copied only to `.claude/skills/baresync/` and `.cursor/skills/baresync/`
- **AND** no auto-detection is performed

### Requirement: Update installed skill
The CLI SHALL support `bunx baresync skills update` to refresh the skill to the latest version.

#### Scenario: Update existing installation
- **WHEN** user runs `bunx baresync skills update` and the skill is already installed
- **THEN** the CLI overwrites the existing skill files with the current version

#### Scenario: Update when not installed
- **WHEN** user runs `bunx baresync skills update` and no skill is installed
- **THEN** the CLI prints "No baresync skill found. Run `bunx baresync skills install` first." and exits

### Requirement: Skill files are included in npm package
The published npm package SHALL include the `skills/baresync/` directory.

#### Scenario: Package contains skill files
- **WHEN** user installs `baresync` via npm/bun/pnpm
- **THEN** `node_modules/baresync/skills/baresync/SKILL.md` exists
- **AND** `node_modules/baresync/skills/baresync/reference/` contains all reference files

### Requirement: Project root detection
The CLI SHALL find the project root by walking up from cwd looking for `.git`.

#### Scenario: Running from subdirectory
- **WHEN** user runs `bunx baresync skills install` from `apps/app/`
- **AND** `.git` exists at the monorepo root
- **THEN** the CLI installs skills relative to the monorepo root, not `apps/app/`

#### Scenario: No git repository
- **WHEN** user runs `bunx baresync skills install` and no `.git` directory exists anywhere up the tree
- **THEN** the CLI uses the current working directory as the project root
