import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it, vi } from "vitest";
import type { GeneratorConfig } from "../generator";
import { runDiagnostics } from "../generator/diagnostics";
import type { SyncContract } from "../schema/contract";
import { defineSyncContract } from "../schema/contract";
import { defineSyncedTable } from "../schema/synced-table";

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
  "../../../../"
);
const inventoryContractRoot = path.join(
  repoRoot,
  "examples/inventory/packages/sync-contract"
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
  options: { includeProtobuf?: boolean; outputSuffix?: string } = {}
): string {
  const outputSuffix = options.outputSuffix ?? "generated";
  const outputDir = path.join(dir, outputSuffix).replaceAll(path.sep, "/");
  const protoDir = path
    .join(dir, `${outputSuffix}-proto`)
    .replaceAll(path.sep, "/");
  const configPath = path.join(dir, "sync.config.ts");
  const source = `
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  apiSyncColumns,
  defineProtobufSyncConfig,
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
  packageName: "inventory.sync.v1",
  tables: {
    categories: { scope: "scope_id" },
  },
});
${
  options.includeProtobuf
    ? `
export const protobufSyncGeneratorConfig = defineProtobufSyncConfig({
  apiSyncedSchema: { categories: apiCategories },
  localSyncedSchema: { categories: localCategories },
  outputDir: ${JSON.stringify(protoDir)},
  outputs: {
    proto: ${JSON.stringify(path.join(protoDir, "sync.proto").replaceAll(path.sep, "/"))},
    runtimeSourceTs: ${JSON.stringify(path.join(protoDir, "runtime-source.ts").replaceAll(path.sep, "/"))},
    runtimeTs: ${JSON.stringify(path.join(protoDir, "runtime.ts").replaceAll(path.sep, "/"))},
    rustSyncMappers: ${JSON.stringify(path.join(protoDir, "sync-mappers.rs").replaceAll(path.sep, "/"))},
    syncTs: ${JSON.stringify(path.join(protoDir, "sync.generated.ts").replaceAll(path.sep, "/"))},
  },
  packageName: "inventory.sync.v1",
  tables: {
    categories: { scope: "scope_id" },
  },
});
`
    : ""
}
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
      encoding: "json",
      packageName: "cli.test.sync.v1",
      tables: [categoriesSynced],
    });

    const { runGenerate } = await import("../cli");
    await runGenerate(contract, outputDir);

    expect(fs.existsSync(path.join(outputDir, "sync-contract.json"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outputDir, "sync-table-order.ts"))).toBe(
      true
    );

    const parsed = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sync-contract.json"), "utf-8")
    );
    expect(parsed.packageName).toBe("cli.test.sync.v1");

    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("includes protobuf metadata for protobuf contracts", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-test-")
    );

    const contract = defineSyncContract({
      encoding: "protobuf",
      packageName: "cli.test.sync.v1",
      tables: [categoriesSynced],
    });

    const { runGenerate } = await import("../cli");
    await runGenerate(contract, outputDir);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sync-contract.json"), "utf-8")
    );
    expect(parsed.encoding).toBe("protobuf");
    expect(parsed.protobuf.tables.categories.rowMessageName).toBe(
      "CategoriesRow"
    );
    expect(parsed.protobuf.tables.categories.requestFieldNumber).toBe(4);

    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("produces artifacts from a generator config object", async () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "baresync-cli-config-test-")
    );

    const contract = defineSyncContract({
      encoding: "json",
      packageName: "cli.config.sync.v1",
      tables: [categoriesSynced],
    });
    const config = {
      contract,
      outputDir,
    } satisfies GeneratorConfig;

    const { runGenerate } = await import("../cli");
    await runGenerate(config);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(outputDir, "sync-contract.json"), "utf-8")
    );
    expect(parsed.packageName).toBe("cli.config.sync.v1");

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
      const { runGenerateCommand } = await import("../cli");
      await runGenerateCommand([]);

      expect(
        fs.existsSync(path.join(cwd, "generated", "sync-contract.json"))
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
      const { runGenerateCommand } = await import("../cli");
      await runGenerateCommand(["--config", "./custom/custom-sync.config.ts"]);

      expect(
        fs.existsSync(path.join(cwd, "custom-output", "sync-contract.json"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(cwd, "generated", "sync-contract.json"))
      ).toBe(false);
    } finally {
      process.chdir(previousCwd);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("runs JSON and protobuf configs from one module", async () => {
    const cwd = createRepoTempDir("baresync-both-");
    writeSyncConfigModule(cwd, { includeProtobuf: true });

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { runGenerateCommand } = await import("../cli");
      const stdoutSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      try {
        await runGenerateCommand([]);

        expect(
          fs.existsSync(path.join(cwd, "generated", "sync-contract.json"))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(cwd, "generated-proto", "sync.proto"))
        ).toBe(true);
        expect(
          stdoutSpy.mock.calls.some((call) =>
            String(call[0]).includes("Running syncGeneratorConfig")
          )
        ).toBe(true);
        expect(
          stdoutSpy.mock.calls.some((call) =>
            String(call[0]).includes("Running protobufSyncGeneratorConfig")
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

  it("runs doctor against discovered config exports", async () => {
    const cwd = createRepoTempDir("baresync-doctor-");
    writeSyncConfigModule(cwd, { includeProtobuf: true });

    const previousCwd = process.cwd();
    process.chdir(cwd);
    try {
      const { runDoctorCommand } = await import("../cli");
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
        expect(
          stdoutSpy.mock.calls.some((call) =>
            String(call[0]).includes(
              "Running diagnostics for protobufSyncGeneratorConfig"
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
      encoding: "json",
      packageName: "test",
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
