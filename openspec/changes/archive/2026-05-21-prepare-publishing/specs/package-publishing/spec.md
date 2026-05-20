## ADDED Requirements

### Requirement: Public npm package manifest

The TypeScript package SHALL be publish-ready as the public npm package `baresync`.

#### Scenario: npm package has public identity

- **WHEN** a maintainer inspects `packages/baresync/package.json`
- **THEN** the manifest SHALL use the package name `baresync`
- **AND** it SHALL NOT be marked private
- **AND** it SHALL include standard public package metadata including version, description, license, repository, package files, and public exports

#### Scenario: npm package exposes stable subpaths

- **WHEN** a consumer installs the packed npm package
- **THEN** the package SHALL expose the root import and the `schema`, `generator`, `db`, `server`, `tauri`, and `limits` subpaths from compiled package output

#### Scenario: npm package exposes CLI binary

- **WHEN** a consumer installs the packed npm package
- **THEN** the `baresync` binary SHALL resolve to an executable compiled CLI entrypoint

### Requirement: npm package build output

The TypeScript package SHALL publish compiled JavaScript and TypeScript declarations instead of raw source files as its public runtime surface.

#### Scenario: Build produces runtime and declaration files

- **WHEN** the package build command runs
- **THEN** it SHALL create compiled JavaScript and declaration files for every public export path

#### Scenario: Packed npm artifact excludes internal test assets

- **WHEN** the npm package is packed for publishing
- **THEN** the tarball SHALL exclude package tests, repository-only fixtures, and large test payloads
- **AND** it SHALL include any non-code templates required by public generator APIs

### Requirement: crates.io package metadata

The Rust crates SHALL be package-ready for crates.io.

#### Scenario: core crate includes public metadata

- **WHEN** a maintainer inspects `crates/baresync-core/Cargo.toml`
- **THEN** the package SHALL include description, license, repository, readme or package documentation metadata, keywords, and categories appropriate for crates.io

#### Scenario: Tauri plugin crate includes public metadata

- **WHEN** a maintainer inspects `crates/tauri-plugin-baresync/Cargo.toml`
- **THEN** the package SHALL include description, license, repository, readme or package documentation metadata, keywords, and categories appropriate for crates.io

### Requirement: package validation commands

The repository SHALL provide repeatable validation commands for release preparation.

#### Scenario: npm package dry run validates packed files

- **WHEN** a maintainer runs the documented npm package validation command
- **THEN** it SHALL build the TypeScript package and show the files that would be included in the published npm tarball

#### Scenario: Cargo package verification validates crates

- **WHEN** a maintainer runs the documented Cargo package validation commands
- **THEN** `baresync-core` and `tauri-plugin-baresync` SHALL package and verify successfully without requiring registry publishing

### Requirement: public install documentation

The public documentation SHALL describe installable package names after package prep is complete.

#### Scenario: README uses public package names

- **WHEN** a consumer reads the README quick start
- **THEN** install and import examples SHALL use the public npm package name `baresync`
- **AND** Rust setup examples SHALL use the public crate name `tauri-plugin-baresync`
- **AND** examples SHALL NOT require workspace-only `@repo/baresync` imports
