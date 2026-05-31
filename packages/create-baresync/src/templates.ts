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

function replacePackageManager(
  content: string,
  options: ScaffoldOptions
): string {
  return content.replaceAll("__PACKAGE_MANAGER__", options.packageManager);
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
  return replaceProjectName(readTemplateAsset("root/package.json"), options);
}

function projectReadme(options: ScaffoldOptions) {
  return replacePackageManager(
    replaceProjectName(readTemplateAsset("root/README.md"), options),
    options
  );
}

function projectScripts(options: ScaffoldOptions) {
  const runWorkspace = replacePackageManager(
    readTemplateAsset("root/scripts/run-workspace.mjs"),
    options
  );
  const dev = replacePackageManager(
    readTemplateAsset("root/scripts/dev.mjs"),
    options
  );
  return [
    {
      content: runWorkspace,
      executable: true,
      path: "scripts/run-workspace.mjs",
    },
    { content: dev, executable: true, path: "scripts/dev.mjs" },
  ];
}

function appPackageJson(options: ScaffoldOptions) {
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
  return readTemplateAsset("app/src/lib.rs");
}

function appDbHelper() {
  return readTemplateAsset("app/db-helper.ts");
}

function appSyncClient() {
  return readTemplateAsset("app/sync-client.ts");
}

function serverPackageJson(options: ScaffoldOptions) {
  return replaceProjectName(readTemplateAsset("server/package.json"), options);
}

function serverDrizzleConfig(options: ScaffoldOptions) {
  return replaceProjectName(
    readTemplateAsset("server/drizzle-config.ts"),
    options
  );
}

function serverSyncRouteModule(options: ScaffoldOptions) {
  if (options.serverFramework === "hono") {
    return {
      fileName: "sync-routes.ts",
      content: readTemplateAsset("server/src/sync-routes.ts"),
    };
  }
  return {
    fileName: "sync-route.ts",
    content: readTemplateAsset("server/src/sync-route.ts"),
  };
}

function serverIndexPatch(options: ScaffoldOptions) {
  if (options.serverFramework === "hono") {
    return readTemplateAsset("server/src/index-hono.ts");
  }
  return readTemplateAsset("server/src/index-elysia.ts");
}

function serverFallbackInstructions(options: ScaffoldOptions) {
  return readTemplateAsset("server/fallback-instructions.md").replaceAll(
    "__ROUTE_FILE__",
    options.serverFramework === "hono" ? "sync-routes.ts" : "sync-route.ts"
  );
}

function appHelperFiles() {
  return [
    file("apps/app/src/lib/baresync-db.ts", appDbHelper()),
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
  const serverRoutes = serverSyncRouteModule(options);

  return [
    file("package.json", projectRootPackageJson(options)),
    file("README.md", projectReadme(options)),
    ...projectScripts(options),
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
    file(`apps/server/src/${serverRoutes.fileName}`, serverRoutes.content),
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
