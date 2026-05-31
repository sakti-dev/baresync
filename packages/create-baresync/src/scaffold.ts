import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { intro, log, outro } from "@clack/prompts";
import color from "picocolors";
import { detectPackageManager } from "./package-manager.js";
import {
  promptPackageManager,
  promptProjectName,
  promptServerFramework,
} from "./prompts.js";
import {
  buildRootScaffoldFiles,
  buildUserFacingNextSteps,
  type PackageManager,
  type ScaffoldOptions,
} from "./templates.js";
import { ensureEmptyTargetDir, writeScaffoldFiles } from "./write.js";

async function runInteractive(
  command: string,
  args: string[],
  cwd: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code ?? 1}`));
    });
  });
}

function createCommandArgs(
  packageManager: PackageManager,
  initializer: string,
  target: string
): string[] {
  if (packageManager === "npm") {
    return ["create", `${initializer}@latest`, target, "--"];
  }

  return ["create", initializer, target];
}

function mergeJson(baseText: string, patchText: string): string {
  const base = JSON.parse(baseText) as Record<string, unknown>;
  const patch = JSON.parse(patchText) as Record<string, unknown>;

  return `${JSON.stringify(deepMerge(base, patch), null, 2)}\n`;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
      continue;
    }

    result[key] = value;
  }

  return result;
}

async function patchPackageJson(
  filePath: string,
  patch: Record<string, unknown>
): Promise<void> {
  const current = await fs.readFile(filePath, "utf8");
  await fs.writeFile(
    filePath,
    mergeJson(current, JSON.stringify(patch)),
    "utf8"
  );
}

function isRootTemplateFile(filePath: string): boolean {
  return !(
    filePath.startsWith("apps/app/") || filePath.startsWith("apps/server/")
  );
}

async function writeTemplateSubset(
  rootDir: string,
  options: ScaffoldOptions
): Promise<void> {
  const files = buildRootScaffoldFiles(options).filter((file) =>
    isRootTemplateFile(file.path)
  );
  await writeScaffoldFiles(rootDir, files);
}

async function patchAppFiles(
  projectDir: string,
  _options: ScaffoldOptions,
  files: ReturnType<typeof buildRootScaffoldFiles>
): Promise<void> {
  const appCargoToml = files.find(
    (file) => file.path === "apps/app/src-tauri/Cargo.toml"
  );
  const appBuildRs = files.find(
    (file) => file.path === "apps/app/src-tauri/build.rs"
  );
  const appLibRs = files.find(
    (file) => file.path === "apps/app/src-tauri/src/lib.rs"
  );
  const appTauriConf = files.find(
    (file) => file.path === "apps/app/src-tauri/tauri.conf.json"
  );
  const appDrizzle = files.find(
    (file) => file.path === "apps/app/drizzle.local.config.ts"
  );
  const appDb = files.find(
    (file) => file.path === "apps/app/src/lib/baresync-db.ts"
  );
  const appSyncClient = files.find(
    (file) => file.path === "apps/app/src/lib/baresync-sync-client.ts"
  );

  if (
    !(
      appCargoToml &&
      appBuildRs &&
      appLibRs &&
      appTauriConf &&
      appDrizzle &&
      appDb &&
      appSyncClient
    )
  ) {
    throw new Error("Missing app scaffold files");
  }

  await patchPackageJson(path.join(projectDir, "apps/app/package.json"), {
    dependencies: {
      baresync: "^0.1.1",
      "drizzle-orm": "^0.45.2",
    },
    devDependencies: {
      "drizzle-kit": "0.31.4",
    },
    scripts: {
      "db:generate:local":
        "drizzle-kit generate --config drizzle.local.config.ts",
      "tauri:build": "tauri build",
      "tauri:dev": "tauri dev",
    },
  });

  await fs.writeFile(
    path.join(projectDir, "apps/app/src-tauri/build.rs"),
    appBuildRs.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/app/src-tauri/Cargo.toml"),
    appCargoToml.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/app/src-tauri/src/lib.rs"),
    appLibRs.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/app/src-tauri/tauri.conf.json"),
    appTauriConf.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/app/drizzle.local.config.ts"),
    appDrizzle.content,
    "utf8"
  );
  await fs.mkdir(path.join(projectDir, "apps/app/src/lib"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectDir, "apps/app/src/lib/baresync-db.ts"),
    appDb.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/app/src/lib/baresync-sync-client.ts"),
    appSyncClient.content,
    "utf8"
  );
}

async function patchServerFiles(
  projectDir: string,
  _options: ScaffoldOptions,
  files: ReturnType<typeof buildRootScaffoldFiles>
): Promise<void> {
  const serverDrizzle = files.find(
    (file) => file.path === "apps/server/drizzle.config.ts"
  );
  const serverIndex = files.find(
    (file) => file.path === "apps/server/src/index.ts"
  );
  const serverRoute = files.find((file) =>
    file.path.includes("apps/server/src/sync-")
  );
  const serverFallback = files.find(
    (file) => file.path === "apps/server/src/sync-fallback-instructions.md"
  );

  if (!(serverDrizzle && serverIndex && serverRoute && serverFallback)) {
    throw new Error("Missing server scaffold files");
  }

  await patchPackageJson(path.join(projectDir, "apps/server/package.json"), {
    dependencies: {
      baresync: "^0.1.1",
    },
    devDependencies: {
      "drizzle-kit": "0.31.4",
    },
    scripts: {
      "db:generate": "drizzle-kit generate --config drizzle.config.ts",
      dev: "PORT=3001 bun --hot src/index.ts",
      typecheck: "bun x tsc -p tsconfig.json --noEmit",
    },
  });

  await fs.writeFile(
    path.join(projectDir, "apps/server/drizzle.config.ts"),
    serverDrizzle.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(
      projectDir,
      `apps/server/src/${serverRoute.path.split("/").at(-1)}`
    ),
    serverRoute.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/server/src/index.ts"),
    serverIndex.content,
    "utf8"
  );
  await fs.writeFile(
    path.join(projectDir, "apps/server/src/sync-fallback-instructions.md"),
    serverFallback.content,
    "utf8"
  );
}

export async function scaffoldProject(): Promise<void> {
  intro(color.bgCyan(color.black(" create-baresync ")));

  const projectName = await promptProjectName();
  const detectedPackageManager = detectPackageManager();
  const packageManager =
    detectedPackageManager ?? (await promptPackageManager());
  const serverFramework = await promptServerFramework();

  const projectDir = path.join(process.cwd(), projectName);
  await ensureEmptyTargetDir(projectDir);

  const options: ScaffoldOptions = {
    packageManager,
    projectName,
    serverFramework,
  };

  const allFiles = buildRootScaffoldFiles(options);

  await writeTemplateSubset(projectDir, options);
  await fs.mkdir(path.join(projectDir, "apps"), { recursive: true });
  await fs.mkdir(path.join(projectDir, "packages"), { recursive: true });

  log.info(
    `Detected package manager: ${packageManager}, server framework: ${serverFramework}`
  );

  const appTargetDir = path.join(projectDir, "apps");
  const serverTargetDir = path.join(projectDir, "apps");

  await runInteractive(
    packageManager,
    createCommandArgs(packageManager, "tauri-app", "app"),
    appTargetDir
  );

  const serverInitializer = serverFramework === "hono" ? "hono" : "elysia";
  await runInteractive(
    packageManager,
    createCommandArgs(packageManager, serverInitializer, "server"),
    serverTargetDir
  );

  await patchAppFiles(projectDir, options, allFiles);
  await patchServerFiles(projectDir, options, allFiles);

  await fs.writeFile(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: projectName,
        private: true,
        workspaces: ["apps/*", "packages/*"],
        scripts: {
          dev: "node ./scripts/dev.mjs",
          "generate:sync":
            "node ./scripts/run-workspace.mjs packages/sync-contract generate",
          "migrate:local":
            "node ./scripts/run-workspace.mjs apps/app db:generate:local",
          "migrate:server":
            "node ./scripts/run-workspace.mjs apps/server db:generate",
        },
      },
      null,
      2
    ),
    "utf8"
  );

  await fs.writeFile(
    path.join(projectDir, "README.md"),
    `# ${projectName}\n\nGenerated with create-baresync.\n\n## Next steps\n\n${buildUserFacingNextSteps(
      options
    )}\n`,
    "utf8"
  );

  outro(
    `${color.green("Success!")} Monorepo scaffolded.\n\n${buildUserFacingNextSteps(
      options
    )}`
  );
}
