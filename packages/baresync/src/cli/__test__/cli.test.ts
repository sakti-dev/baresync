import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it, vi } from "vitest";
import type { GeneratorConfig } from "../../generator";
import { runDiagnostics } from "../../generator/diagnostics";
import type { SyncContract } from "../../schema/contract";
import { defineSyncContract } from "../../schema/contract";
import { defineSyncedTable } from "../../schema/synced-table";

const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const categoriesSynced = defineSyncedTable({
  table: categories,
  scope: {
    source: "scope",
    field: "merchantId",
    column: categories.merchantId,
  },
  localOnlyColumns: ["isSynced"],
});

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../"
);
const inventoryContractRoot = path.join(
  repoRoot,
  "examples/inventory-json-polling/packages/sync-contract"
);
const repoTempRoot = path.join(inventoryContractRoot, ".tmp", "cli-tests");
const baresyncSourceUrl = pathToFileURL(
  path.join(repoRoot, "packages/baresync/src/index.ts")
).href;

function createRepoTempDir(prefix: string): string {
  fs.mkdirSync(repoTempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(repoTempRoot, prefix));
}

function writeSyncConfigModule(
  dir: string,
  options: { outputSuffix?: string } = {}
): string {
  const outputSuffix = options.outputSuffix ?? "generated";
  const outputDir = path.join(dir, outputSuffix).replaceAll(path.sep, "/");
  const configPath = path.join(dir, "sync.config.ts");
  const source = `
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  apiSyncColumns,
  defineSyncConfig,
  localSyncColumns,
} from ${JSON.stringify(baresyncSourceUrl)};

const localCategories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...localSyncColumns(),
});

const apiCategories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id").notNull(),
  name: text("name").notNull(),
  ...apiSyncColumns(),
});

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema: { categories: apiCategories },
  localSyncedSchema: { categories: localCategories },
  outputDir: ${JSON.stringify(outputDir)},
  tables: {
    categories: { scopeColumn: "scope_id" },
  },
});
`;
  fs.writeFileSync(configPath, source);
  return configPath;
}

describe("CLI runGenerate", () => {
  it("produces artifacts from a contract config module", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-test-")
    );

    const contract = defineSyncContract({
      tables: [categoriesSynced],
    });

    const { runGenerate } = await import("../generator");
    await runGenerate(contract, outputDir);

    const today = new Date().toISOString().slice(0, 10);
    expect(
      fs.existsSync(path.join(outputDir, today, "sync-contract.json"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, today, "sync-table-order.ts"))
    ).toBe(true);

    const parsed = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, today, "sync-contract.json"),
        "utf-8"
      )
    );
    expect(parsed).not.toHaveProperty("packageName");

    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("produces artifacts from a generator config object", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-config-test-")
    );

    const contract = defineSyncContract({
      tables: [categoriesSynced],
    });
    const config = {
      contract,
      outputDir,
    } satisfies GeneratorConfig;

    const { runGenerate } = await import("../generator");
    await runGenerate(config);

    const today = new Date().toISOString().slice(0, 10);
    const parsed = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, today, "sync-contract.json"),
        "utf-8"
      )
    );
    expect(parsed).not.toHaveProperty("packageName");

    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});

describe("CLI config discovery", () => {
  it("discovers sync.config.ts from the current directory", async () => {
    const cwd = createRepoTempDir("baresync-discover-");
    writeSyncConfigModule(cwd);

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { runGenerateCommand } = await import("../generator");
      await runGenerateCommand([]);

      const today = new Date().toISOString().slice(0, 10);
      expect(
        fs.existsSync(path.join(cwd, "generated", today, "sync-contract.json"))
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prefers --config over auto-discovery", async () => {
    const cwd = createRepoTempDir("baresync-config-");
    writeSyncConfigModule(cwd);
    const customConfigDir = path.join(cwd, "custom");
    fs.mkdirSync(customConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(customConfigDir, "custom-sync.config.ts"),
      fs
        .readFileSync(path.join(cwd, "sync.config.ts"), "utf-8")
        .replace(/generated/g, "custom-output")
    );

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { runGenerateCommand } = await import("../generator");
      await runGenerateCommand(["--config", "./custom/custom-sync.config.ts"]);

      const today = new Date().toISOString().slice(0, 10);
      expect(
        fs.existsSync(
          path.join(cwd, "custom-output", today, "sync-contract.json")
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(cwd, "generated", today, "sync-contract.json"))
      ).toBe(false);
    } finally {
      process.chdir(previousCwd);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("runs doctor against discovered config exports", async () => {
    const cwd = createRepoTempDir("baresync-doctor-");
    writeSyncConfigModule(cwd);

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { runDoctorCommand } = await import("../generator");
      const stdoutSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      try {
        await runDoctorCommand([]);

        expect(
          stdoutSpy.mock.calls.some((call) =>
            String(call[0]).includes(
              "Running diagnostics for syncGeneratorConfig"
            )
          )
        ).toBe(true);
      } finally {
        stdoutSpy.mockRestore();
      }
    } finally {
      process.chdir(previousCwd);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("CLI entrypoint", () => {
  it("runs when loaded through a launcher path that differs from the module path", () => {
    const cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-entrypoint-")
    );
    const launcherPath = path.join(cwd, "launcher.mjs");
    const cliSourceUrl = pathToFileURL(
      path.join(repoRoot, "packages/baresync/src/cli/index.ts")
    ).href;

    fs.mkdirSync(path.join(cwd, ".git"));
    fs.writeFileSync(launcherPath, `import ${JSON.stringify(cliSourceUrl)};\n`);

    try {
      const result = spawnSync(
        "bun",
        [
          launcherPath,
          "skills",
          "install",
          "--yes",
          "--providers",
          ".claude,.agents",
        ],
        {
          cwd,
          encoding: "utf-8",
        }
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "Installed baresync skill into: .claude, .agents (2 folder(s))"
      );
      expect(
        fs.existsSync(path.join(cwd, ".claude/skills/baresync/SKILL.md"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(cwd, ".agents/skills/baresync/SKILL.md"))
      ).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("doctor output format", () => {
  it("produces diagnostics with required fields for errors", () => {
    const table = sqliteTable("no_col", {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      deletedAt: text("deleted_at"),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
    });
    const { getTableConfig: gtc } =
      require("drizzle-orm/sqlite-core") as typeof import("drizzle-orm/sqlite-core");
    const config = gtc(table);
    const contract: SyncContract = {
      tables: [
        {
          table,
          scope: { source: "scope", field: "scope", column: table.scope },
        },
      ],
      tablesMeta: [
        {
          tableName: config.name,
          columns: config.columns.map((c) => c.name),
          scope: { field: "scope" },
          localOnlyColumns: [],
          serverOnlyColumns: [],
        },
      ],
      limits: { maxPushBytes: 2_097_152, maxPushRows: 2000 },
    };
    const diagnostics = runDiagnostics(contract);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.code).toBeTruthy();
      expect(e.why).toBeTruthy();
      expect(e.fix).toBeTruthy();
    }
  });
});
