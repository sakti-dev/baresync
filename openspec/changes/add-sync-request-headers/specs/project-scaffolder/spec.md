## ADDED Requirements

### Requirement: Authenticated sync scaffold guidance

The scaffolder SHALL generate starter files and completion guidance that teach the default authenticated sync flow without turning the scaffold into an auth framework.

#### Scenario: Starter client shows JS-owned headers

- **WHEN** the scaffolder generates `packages/create-baresync/src/templates/app/sync-client.ts`
- **THEN** the starter client SHALL show `createSyncClient({ scopeId, invoke })`
- **AND** it SHALL show `client.setHeaders(...)` after login for JS-owned credentials
- **AND** it SHALL show `client.startPolling()` after headers are set

#### Scenario: Starter client shows header replacement

- **WHEN** a user inspects the generated sync client template
- **THEN** it SHALL show that token refresh is handled by calling `setHeaders` again with the full replacement header set
- **AND** it SHALL NOT imply that recreating the client is required for refresh

#### Scenario: Starter README explains the auth split

- **WHEN** the scaffolder generates `packages/create-baresync/src/templates/root/README.md`
- **THEN** the README SHALL explain that JS usually owns login and request headers
- **AND** it SHALL mention that Rust/native secure-storage flows may update the same header store through host-callable Rust logic
- **AND** it SHALL state that the scaffold does not own authorization decisions

#### Scenario: Server fallback instructions mention headers

- **WHEN** the scaffolder generates `packages/create-baresync/src/templates/server/fallback-instructions.md`
- **THEN** the fallback instructions SHALL remind users that server `resolveScope` can inspect request headers
- **AND** they SHALL direct users to keep auth ownership in the server and runtime header ownership in the app

#### Scenario: Generated next steps mention request headers

- **WHEN** scaffold generation completes
- **THEN** the final output SHALL include next steps that explicitly mention setting request headers for protected sync routes
- **AND** the output SHALL NOT suggest app-local wrapper commands as the default authenticated sync path

### Requirement: Scaffold templates remain aligned with auth docs

The scaffolder SHALL keep starter scripts and template docs aligned with the authenticated sync docs and skills so new projects do not drift from the public contract.

#### Scenario: Template and docs use the same header lifecycle language

- **WHEN** a user compares the scaffold output with the public docs
- **THEN** the generated client and README SHALL use the same header lifecycle concepts as the docs
- **AND** those files SHALL mention login, `setHeaders`, refresh, and logout in a consistent way

#### Scenario: Scaffold does not add an auth framework

- **WHEN** the scaffolder generates a new project
- **THEN** it SHALL NOT add OAuth helpers, token refresh storage, keychain code, or app-local auth wrapper commands
- **AND** it SHALL keep auth plumbing app-owned

### Requirement: Scaffold tests cover auth guidance

The scaffolder SHALL include tests that lock in the authenticated sync guidance in generated templates and startup output.

#### Scenario: Generated sync client mentions setHeaders

- **WHEN** scaffold tests inspect the generated `sync-client.ts` template
- **THEN** they SHALL assert that the template includes `setHeaders` and the correct startup order around polling

#### Scenario: Generated README and fallback instructions mention headers

- **WHEN** scaffold tests inspect the generated README and server fallback instructions
- **THEN** they SHALL assert that those files mention request headers and the app/server auth split

#### Scenario: Generated next steps mention auth headers

- **WHEN** scaffold tests inspect the completion output
- **THEN** they SHALL assert that the output points users toward request-header setup for protected routes

### Requirement: Scaffold script templates reflect authenticated sync

The scaffolder SHALL keep generated script templates aligned with the authenticated sync flow so new projects inherit the right commands and helper names.

#### Scenario: Root workspace scripts stay consistent

- **WHEN** the scaffolder generates the root workspace scripts in `packages/create-baresync/src/templates/root/package.json`
- **THEN** the generated scripts SHALL remain compatible with sync artifact generation, local migrations, server migrations, and development startup
- **AND** the script template guidance SHALL not introduce auth-specific wrapper scripts as the default setup

#### Scenario: App template scripts stay aligned

- **WHEN** the scaffolder generates the app template in `packages/create-baresync/src/templates/app/package.json`
- **THEN** any starter scripts or helper entries related to sync SHALL remain consistent with the runtime header flow described in the docs
- **AND** they SHALL not suggest app-local auth wrapper commands as the primary integration path

#### Scenario: Script template output is testable

- **WHEN** scaffold tests inspect the generated script templates
- **THEN** they SHALL assert that the generated files still point users toward the documented auth/header flow
- **AND** they SHALL detect accidental regressions where script text or next steps omit request-header setup

## MODIFIED Requirements

### Requirement: Frontend helper modules generated

The scaffolder SHALL generate framework-neutral DB and sync-client helper modules.

#### Scenario: Frontend helper modules generated

- **WHEN** the scaffolder configures frontend source files
- **THEN** it SHALL generate framework-neutral DB and sync-client helper modules
- **AND** the generated sync-client helper SHALL include the auth/header lifecycle expected by the public Baresync docs
- **AND** it SHALL NOT modify framework-specific root components or provider trees

### Requirement: Scaffold completion guidance

The scaffolder SHALL print next steps that match the detected package manager and generated scripts.

#### Scenario: Completion output includes generation commands

- **WHEN** scaffolding completes
- **THEN** the final output SHALL include commands to install dependencies, generate local migrations, generate server migrations, generate sync artifacts, and start development
- **AND** the final output SHALL mention request-header setup for protected routes so authenticated sync is discoverable from the first run
