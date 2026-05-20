## Context

Baresync is split across a TypeScript package and two Rust crates. The TypeScript package currently has a private workspace manifest named `@repo/baresync` and exports raw `src/*.ts` files. A dry-run npm pack includes tests and large sync fixtures, which is useful for internal testing but not appropriate as the default public package shape.

The Rust crates already package structurally, but both lack standard crates.io metadata. `baresync-core` verifies successfully with warnings. `tauri-plugin-baresync` does not verify because its dependency on `baresync-core` is path-only; Cargo requires a version for dependencies when packaging.

Publishing prep needs to make the public artifacts installable by real consumer projects before adding a fullstack example. The example should eventually depend on `baresync` and `tauri-plugin-baresync`, not workspace-only `@repo/*` paths.

## Goals / Non-Goals

**Goals:**

- Define the npm package name, public exports, CLI entrypoint, and packaged file set.
- Produce compiled JavaScript and TypeScript declarations for the npm package.
- Prepare both Rust crates for crates.io package verification.
- Preserve local monorepo development with workspace/path dependencies.
- Add repeatable dry-run validation for npm and Cargo packaging.
- Update public documentation to describe installable package names once the package shape is ready.

**Non-Goals:**

- Actually publish to npm or crates.io.
- Add release automation, signing, provenance, changelog generation, or CI publishing.
- Build the fullstack Fieldkit example in this change.
- Stabilize every public API beyond the current package surface needed for pre-release publishing.
- Rename internal fixture packages unless they directly block package validation.

## Decisions

### Publish one TypeScript package named `baresync`

The npm package should be renamed from private `@repo/baresync` to public `baresync`, with `private` removed when package validation is ready. This matches the README’s intended public name and keeps the first user install command simple.

Alternative considered: use a scoped package such as `@baresync/core`. That leaves room for a multi-package JS ecosystem, but it adds registry ownership work and does not match the current product shape. A single `baresync` package is clearer while the API is still compact.

### Publish compiled `dist` files, not raw TypeScript source

The package exports should point at generated `dist` JavaScript and declaration files. The package should include only runtime/build-relevant files, templates needed by the generator, and metadata such as README/license. Tests, internal fixtures, and large payload samples should stay out of the default npm tarball unless a fixture subpackage is intentionally created later.

Alternative considered: publish raw TypeScript. That is simpler for Bun users but weaker for Node, package managers, documentation, and downstream tooling. Since this package is intended for open-source consumers, compiled output is the safer default.

### Keep Rust crate names as `baresync-core` and `tauri-plugin-baresync`

The crate names are descriptive, align with the existing repository layout, and follow the common Tauri plugin naming pattern. `tauri-plugin-baresync` should depend on `baresync-core` with both `version = "0.1.0"` and `path = "../baresync-core"` so local development still uses the workspace path while Cargo package verification has a registry version to resolve.

Alternative considered: hide `baresync-core` from public publishing and vendor it inside the plugin. That would make the plugin crate less reusable and complicate the core engine’s own tests and future non-Tauri integrations.

### Manual publishing, automated validation

This change should add commands that maintainers can run locally before publishing: TypeScript typecheck, npm build, npm pack dry run, Cargo package verification, and existing lint checks. Actual `npm publish` and `cargo publish` should remain manual until release automation exists.

Alternative considered: add a full release workflow now. That is premature because package metadata, naming, and example strategy are still settling.

## Risks / Trade-offs

- Public package names may be claimed before publishing -> check npm and crates.io availability immediately before release.
- Compiled output may expose missing file extensions or Node resolution problems that raw Bun/TypeScript usage hid -> verify packed package contents and run import smoke checks against the tarball.
- Removing tests and fixtures from the npm package may break generator tests if they assume package-local fixture files at runtime -> keep fixture access internal to repository tests and verify the packed tarball separately.
- Path plus version dependencies can drift -> keep crate versions synchronized and add package verification for both crates.
- Publishing `0.1.0` is irreversible on both registries -> treat the first publish as pre-release quality but still review exported API names carefully.
