import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScaffoldFile } from "./write.js";

export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";
export type ServerFramework = "hono" | "elysia";

export interface ScaffoldOptions {
  packageManager: PackageManager;
  projectName: string;
  serverFramework: ServerFramework;
}

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const templatesRoot = path.join(baseDir, "templates");

function readTemplateAsset(relativePath: string): string {
  return fs.readFileSync(path.join(templatesRoot, relativePath), "utf8");
}

function file(
  filePath: string,
  content: string,
  executable = false
): ScaffoldFile {
  return { content, executable, path: filePath };
}

function replaceProjectName(content: string, options: ScaffoldOptions): string {
  return content.replaceAll("__PROJECT_NAME__", options.projectName);
}

function replaceContractDate(content: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return content.replaceAll("__CONTRACT_DATE__", date);
}

function replacePackageManager(
  content: string,
  options: ScaffoldOptions
): string {
  return content.replaceAll("__PACKAGE_MANAGER__", options.packageManager);
}

function runInWorkspaceCommand(pm: PackageManager): string {
  switch (pm) {
    case "bun":
      return "bun run --cwd";
    case "pnpm":
      return "pnpm --filter";
    case "npm":
      return "npm run -w";
    case "yarn":
      return "yarn workspace";
    default:
      return "bun run --cwd";
  }
}

function devScript(pm: PackageManager): string {
  const run = runInWorkspaceCommand(pm);
  return `concurrently "${run} apps/server dev" "${run} apps/app tauri:dev"`;
}

function replaceRootScripts(content: string, options: ScaffoldOptions): string {
  return content
    .replaceAll(
      "__RUN_IN_WORKSPACE__",
      runInWorkspaceCommand(options.packageManager)
    )
    .replaceAll("__DEV_SCRIPT__", devScript(options.packageManager));
}

function syncContractPackageJson() {
  return readTemplateAsset("sync-contract/package.json");
}

function syncContractTsconfig() {
  return readTemplateAsset("sync-contract/tsconfig.json");
}

function syncContractConstants(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("sync-contract/src/constants.ts"),
    options
  );
}

function syncContractLocalSchema() {
  return readTemplateAsset("sync-contract/src/local-schema.ts");
}

function syncContractApiSchema() {
  return readTemplateAsset("sync-contract/src/api-schema.ts");
}

function syncContractLocalSyncedSchema() {
  return readTemplateAsset("sync-contract/src/local-synced-schema.ts");
}

function syncContractApiSyncedSchema() {
  return readTemplateAsset("sync-contract/src/api-synced-schema.ts");
}

function syncContractConfig() {
  return readTemplateAsset("sync-contract/sync.config.ts");
}

function projectRootPackageJson(options: ScaffoldOptions) {
  return replaceRootScripts(
    replaceProjectName(readTemplateAsset("root/package.json"), options),
    options
  );
}

function projectReadme(options: ScaffoldOptions) {
  return replacePackageManager(
    replaceProjectName(readTemplateAsset("root/README.md"), options),
    options
  );
}

export function appPackageJson(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("app/package.json"), options);
}

function appCargoToml(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("app/src-tauri/Cargo.toml"),
    options
  );
}

function appBuildRs() {
  return readTemplateAsset("app/src-tauri/build.rs");
}

function appTauriConf(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("app/src-tauri/tauri.conf.json"),
    options
  );
}

function appLibRs() {
  return replaceContractDate(readTemplateAsset("app/src/lib.rs"));
}

function appDbHelper() {
  return readTemplateAsset("app/db-helper.ts");
}

function appSyncClient() {
  return readTemplateAsset("app/sync-client.ts");
}

export function serverPackageJson(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("server/package.json"), options);
}

export function prependPort(originalDevScript: string): string {
  return `PORT=3001 ${originalDevScript}`;
}

function serverDrizzleConfig(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("server/drizzle-config.ts"),
    options
  );
}

function serverDbClient(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("server/src-db/client.ts"),
    options
  );
}

function serverSyncRepository() {
  return replaceContractDate(
    readTemplateAsset("server/src-db/v1/sync-repository.ts")
  );
}

function serverV1Routes(options: ScaffoldOptions) {
  if (options.serverFramework === "hono") {
    return replaceProjectName(
      readTemplateAsset("server/src/v1/routes-hono.ts"),
      options
    );
  }
  return replaceProjectName(
    readTemplateAsset("server/src/v1/routes-elysia.ts"),
    options
  );
}

function serverIndexPatch(options: ScaffoldOptions) {
  if (options.serverFramework === "hono") {
    return replaceProjectName(
      readTemplateAsset("server/src/index-hono.ts"),
      options
    );
  }
  return replaceProjectName(
    readTemplateAsset("server/src/index-elysia.ts"),
    options
  );
}

function serverFallbackInstructions(_options: ScaffoldOptions) {
  return readTemplateAsset("server/fallback-instructions.md");
}

function appHelperFiles() {
  return [
    file("apps/app/src/lib/db.ts", appDbHelper()),
    file("apps/app/src/lib/baresync-sync-client.ts", appSyncClient()),
  ];
}

function appTauriFiles(options: ScaffoldOptions) {
  return [
    file("apps/app/src-tauri/build.rs", appBuildRs()),
    file("apps/app/src-tauri/Cargo.toml", appCargoToml(options)),
    file("apps/app/src-tauri/src/lib.rs", appLibRs()),
    file("apps/app/src-tauri/tauri.conf.json", appTauriConf(options)),
  ];
}

function appDrizzleConfigFile(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("app/drizzle-local-config.ts"),
    options
  );
}

export function buildRootScaffoldFiles(
  options: ScaffoldOptions
): ScaffoldFile[] {
  return [
    file("package.json", projectRootPackageJson(options)),
    file("README.md", projectReadme(options)),
    file("packages/sync-contract/package.json", syncContractPackageJson()),
    file("packages/sync-contract/tsconfig.json", syncContractTsconfig()),
    file(
      "packages/sync-contract/src/constants.ts",
      syncContractConstants(options)
    ),
    file(
      "packages/sync-contract/src/local-schema.ts",
      syncContractLocalSchema()
    ),
    file("packages/sync-contract/src/api-schema.ts", syncContractApiSchema()),
    file(
      "packages/sync-contract/src/local-synced-schema.ts",
      syncContractLocalSyncedSchema()
    ),
    file(
      "packages/sync-contract/src/api-synced-schema.ts",
      syncContractApiSyncedSchema()
    ),
    file("packages/sync-contract/sync.config.ts", syncContractConfig()),
    ...appTauriFiles(options),
    file("apps/app/package.json", appPackageJson(options)),
    file("apps/app/drizzle.local.config.ts", appDrizzleConfigFile(options)),
    ...appHelperFiles(),
    file("apps/server/package.json", serverPackageJson(options)),
    file("apps/server/drizzle.config.ts", serverDrizzleConfig(options)),
    file("apps/server/src/db/client.ts", serverDbClient(options)),
    file("apps/server/src/db/v1/sync-repository.ts", serverSyncRepository()),
    file("apps/server/src/v1/routes.ts", serverV1Routes(options)),
    file(
      "apps/server/src/sync-fallback-instructions.md",
      serverFallbackInstructions(options)
    ),
    file("apps/server/src/index.ts", serverIndexPatch(options)),
  ];
}

export function buildUserFacingNextSteps(options: ScaffoldOptions): string {
  return [
    `1. cd ${options.projectName}`,
    `2. ${options.packageManager} install`,
    `3. ${options.packageManager} run generate:sync`,
    `4. ${options.packageManager} run migrate:local`,
    `5. ${options.packageManager} run migrate:server`,
    `6. ${options.packageManager} run dev`,
  ].join("\n");
}
