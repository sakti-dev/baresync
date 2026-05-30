## Context

`tauri-plugin-baresync` currently supports embedded migrations through `Builder::migrations(...)` and filesystem migrations through `Builder::migrations_dir(...)`. The directory API accepts a raw `PathBuf`, so relative paths depend on the process working directory. That makes the simple setup attractive in development but unclear for packaged Tauri apps, where migration files must be resolved from bundled resources.

The intended user experience is to let app authors point Baresync at Drizzle-generated `.sql` files without writing a custom migration build script. Production behavior still needs to be deterministic: packaged apps should resolve relative migration paths from Tauri resources, while absolute paths should remain available for explicit external directories.

## Goals / Non-Goals

**Goals:**

- Replace `.migrations_dir(...)` with a clearer directory path API.
- Make relative migration paths production-oriented by resolving them from Tauri's resource directory during plugin setup.
- Keep `.migrations(...)` for manual embedded migrations.
- Keep migration application timing unchanged: migrations run during setup before command state is exposed, and `run_migrations` reuses the same configured source.
- Update docs and the example app so the simple path-based setup is the primary path.

**Non-Goals:**

- Do not add runtime JS commands for choosing or changing migration paths.
- Do not generate or modify Drizzle migration files.
- Do not remove support for manually embedded migrations.
- Do not make the Rust builder automatically edit `tauri.conf.json`; app authors must still declare bundled resources.

## Decisions

Use a new `Builder::migrations_path(...)` method as the replacement for `migrations_dir`. The name describes the user-facing intent without exposing whether the path resolves from resources or an absolute filesystem location. Relative paths will be resolved during setup through Tauri's resource resolver; absolute paths will be used directly.

Keep `Builder::migrations(...)` as the manual embedded path. This remains useful for applications that want migrations compiled into the binary instead of packaged as separate resource files.

Reject configurations that combine embedded migrations and `migrations_path`. The old implementation allowed embedded migrations followed by filesystem migrations, but the new API is meant to make setup modes clear. A single migration source avoids duplicate or surprising ordering when users migrate from build-script embedding to directory scanning.

Store the resolved migration path in `PluginState` rather than the user-provided path. This keeps the `run_migrations` command behavior identical to startup and avoids resolving resources differently between setup and later commands.

Update the example app to use `migrations_path("migrations")` and declare the migration files in Tauri bundle resources. This demonstrates the production-ready setup directly and removes the custom migration manifest generation from the example.

## Risks / Trade-offs

- Existing consumers using `.migrations_dir(...)` will need a source change -> Mitigate with docs that show the replacement `.migrations_path(...)` call.
- Relative resource resolution depends on Tauri resource bundling configuration -> Mitigate by documenting the required `bundle.resources` entry and adding it to the example app.
- Resource paths can differ by platform -> Mitigate by relying on Tauri's resource resolver instead of process working directory assumptions.
- Rejecting combined embedded and path migrations removes a previously possible advanced setup -> Mitigate by keeping manual embedding available and requiring consumers to choose one source.
