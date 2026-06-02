import fs from "node:fs";
import path from "node:path";
import type { GeneratorConfig } from "../generator/config";
import { runDiagnostics, type SyncDiagnostic } from "../generator/diagnostics";
import { generateSyncArtifacts, SyncDiagnosticError } from "../generator/index";
import type { SyncContract } from "../schema/contract";

type GenerateSource = GeneratorConfig | string | SyncContract;
type LoadedConfig = Record<string, unknown>;

const CONFIG_FILENAMES = [
  "sync.config.ts",
  "sync.config.mts",
  "sync.config.js",
  "sync.config.mjs",
] as const;

interface GenerateCliOptions {
  check?: boolean;
  configPath?: string;
  outputDir?: string;
  warningsAsErrors?: boolean;
}

interface LoadedConfigEntry {
  contract: SyncContract;
  key: string;
  label: string;
  outputDir?: string;
  syncConfig?: GeneratorConfig;
}

async function resolveGenerateSource(
  configPathOrContract: GenerateSource
): Promise<GeneratorConfig | SyncContract> {
  if (typeof configPathOrContract !== "string") {
    return configPathOrContract;
  }

  const absPath = path.resolve(configPathOrContract);
  const configModule = (await import(absPath)) as LoadedConfig;
  return getLegacyGenerateExport(configModule, absPath);
}

function getLegacyGenerateExport(
  configModule: LoadedConfig,
  absPath: string
): GeneratorConfig | SyncContract {
  const config =
    configModule.default ??
    configModule.syncGeneratorConfig ??
    configModule.contract;

  if (!config || typeof config !== "object") {
    throw new Error(
      `No default export, "syncGeneratorConfig" export, or "contract" export found in ${absPath}`
    );
  }

  return config as GeneratorConfig | SyncContract;
}

export async function runGenerate(
  configPathOrContract: GenerateSource,
  outputDir?: string,
  options?: { check?: boolean; warningsAsErrors?: boolean }
): Promise<void> {
  const source = await resolveGenerateSource(configPathOrContract);
  const contract = "contract" in source ? source.contract : source;
  const resolvedOutputDir =
    outputDir ?? ("contract" in source ? source.outputDir : "./generated");

  if (!(resolvedOutputDir || options?.check)) {
    throw new Error(
      "No output directory provided for sync artifact generation"
    );
  }

  if (options?.check) {
    const diagnostics = runDiagnostics(contract);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new SyncDiagnosticError(diagnostics);
    }
    return;
  }

  generateSyncArtifacts(contract, resolvedOutputDir!, {
    warningsAsErrors: options?.warningsAsErrors,
  });
}

export async function runGenerateCommand(args: string[]): Promise<void> {
  const options = parseGenerateCliArgs(args);
  const resolved = await loadConfigModuleFromCliOptions(options);
  const entries = resolveLoadedConfigEntries(resolved.module, resolved.path, {
    outputDir: options.outputDir,
  });

  process.stdout.write(`Loaded config: ${resolved.path}\n`);

  if (options.check) {
    const diagnostics = entries.flatMap((entry) =>
      runDiagnostics(entry.contract)
    );
    const errors = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error"
    );
    const warnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning"
    );

    if (options.warningsAsErrors) {
      errors.push(...warnings);
    }

    if (errors.length > 0) {
      throw new SyncDiagnosticError(diagnostics);
    }

    process.stdout.write(
      `Validated ${entries.length} config export(s) from ${resolved.path}\n`
    );
    return;
  }

  for (const entry of entries) {
    process.stdout.write(`Running ${entry.label}\n`);
    if (entry.syncConfig) {
      generateSyncArtifacts(entry.syncConfig);
      continue;
    }

    generateSyncArtifacts(entry.contract, entry.outputDir ?? "./generated", {
      warningsAsErrors: options.warningsAsErrors,
    });
  }
}

export async function runDoctor(configPath: string): Promise<void> {
  const absPath = path.resolve(configPath);
  const configModule = (await import(absPath)) as LoadedConfig;
  const entries = resolveLoadedConfigEntries(configModule, absPath);

  process.stdout.write(`Loaded config: ${absPath}\n`);
  let hasErrors = false;

  for (const entry of entries) {
    hasErrors ||= printDiagnosticsReport(
      `diagnostics for ${entry.label}`,
      runDiagnostics(entry.contract)
    );
  }

  if (hasErrors) {
    process.exit(1);
  }
}

export async function runDoctorCommand(args: string[]): Promise<void> {
  const options = parseDoctorCliArgs(args);
  const resolved = await loadConfigModuleFromCliOptions(options);
  const entries = resolveLoadedConfigEntries(resolved.module, resolved.path);

  process.stdout.write(`Loaded config: ${resolved.path}\n`);

  for (const entry of entries) {
    if (
      printDiagnosticsReport(
        `diagnostics for ${entry.label}`,
        runDiagnostics(entry.contract)
      )
    ) {
      process.exitCode = 1;
    }
  }
}

function printDiagnosticsReport(
  heading: string,
  diagnostics: SyncDiagnostic[]
): boolean {
  process.stdout.write(`Running ${heading}\n`);

  for (const diagnostic of diagnostics) {
    process.stdout.write(`${formatDiagnosticPrefix(diagnostic)}\n`);
    process.stdout.write(`       Why: ${diagnostic.why}\n`);
    process.stdout.write(`       Fix: ${diagnostic.fix}\n`);
    if (diagnostic.docs) {
      process.stdout.write(`       Docs: ${diagnostic.docs}\n`);
    }
  }

  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  );
  const infos = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "info"
  );

  process.stdout.write(
    `\n${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s)\n`
  );

  return errors.length > 0;
}

function formatDiagnosticPrefix(diagnostic: SyncDiagnostic): string {
  let prefix = "INFO ";
  if (diagnostic.severity === "error") {
    prefix = "ERROR";
  } else if (diagnostic.severity === "warning") {
    prefix = "WARN ";
  }

  let location = "";
  if (diagnostic.table && diagnostic.column) {
    location = ` [${diagnostic.table}.${diagnostic.column}]`;
  } else if (diagnostic.table) {
    location = ` [${diagnostic.table}]`;
  }

  return `${prefix} ${diagnostic.code}${location}: ${diagnostic.message}`;
}

function parseGenerateCliArgs(args: string[]): GenerateCliOptions {
  const options: GenerateCliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--check") {
      options.check = true;
      continue;
    }

    if (arg === "--warnings-as-errors") {
      options.warningsAsErrors = true;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      options.outputDir = args[i + 1];
      i++;
      continue;
    }

    if (arg === "--config") {
      options.configPath = args[i + 1];
      i++;
      continue;
    }

    if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
      continue;
    }

    if (!(options.configPath || arg.startsWith("-"))) {
      options.configPath = arg;
    }
  }

  return options;
}

function parseDoctorCliArgs(args: string[]): { configPath?: string } {
  const options: { configPath?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--config") {
      options.configPath = args[i + 1];
      i++;
      continue;
    }

    if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
      continue;
    }

    if (!(options.configPath || arg.startsWith("-"))) {
      options.configPath = arg;
    }
  }

  return options;
}

async function loadConfigModuleFromCliOptions(options: {
  configPath?: string;
}): Promise<{ module: LoadedConfig; path: string }> {
  const resolvedPath = resolveConfigPath(options.configPath);

  if (!resolvedPath) {
    throw new Error(
      `No sync config found in ${process.cwd()}. Searched: ${CONFIG_FILENAMES.join(", ")}`
    );
  }

  return {
    module: (await import(resolvedPath)) as LoadedConfig,
    path: resolvedPath,
  };
}

function resolveConfigPath(configPath?: string): string | null {
  if (configPath) {
    return path.resolve(configPath);
  }

  const cwd = process.cwd();
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.join(cwd, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveLoadedConfigEntries(
  configModule: LoadedConfig,
  absPath: string,
  options?: { outputDir?: string }
): LoadedConfigEntry[] {
  const entries = new Map<string, LoadedConfigEntry>();
  addLoadedConfigEntry(
    entries,
    buildNamedJsonEntry(configModule.syncGeneratorConfig, options?.outputDir)
  );
  addLoadedConfigEntry(
    entries,
    buildDefaultExportEntry(configModule.default, options?.outputDir)
  );
  addLoadedConfigEntry(
    entries,
    buildRawContractEntry(configModule.contract, options?.outputDir)
  );

  if (entries.size === 0) {
    throw new Error(
      `No default export, "syncGeneratorConfig" export, or "contract" export found in ${absPath}`
    );
  }

  return [...entries.values()];
}

function addLoadedConfigEntry(
  entries: Map<string, LoadedConfigEntry>,
  entry: LoadedConfigEntry | null
): void {
  if (entry && !entries.has(entry.key)) {
    entries.set(entry.key, entry);
  }
}

function buildNamedJsonEntry(
  config: unknown,
  outputDirOverride?: string
): LoadedConfigEntry | null {
  if (!isGeneratorConfig(config)) {
    return null;
  }

  const outputDir = outputDirOverride ?? config.outputDir;
  const key = `${outputDir}`;
  return {
    contract: config.contract,
    key,
    label: "syncGeneratorConfig",
    outputDir,
    syncConfig: {
      ...config,
      outputDir,
    },
  };
}

function buildDefaultExportEntry(
  config: unknown,
  outputDirOverride?: string
): LoadedConfigEntry | null {
  if (isGeneratorConfig(config)) {
    const outputDir = outputDirOverride ?? config.outputDir;
    const key = `${outputDir}`;
    return {
      contract: config.contract,
      key,
      label: "default export",
      outputDir,
      syncConfig: {
        ...config,
        outputDir,
      },
    };
  }

  if (isSyncContract(config)) {
    const outputDir = outputDirOverride ?? "./generated";
    const key = `${outputDir}`;
    return {
      contract: config,
      key,
      label: "default export contract",
      outputDir,
    };
  }

  return null;
}

function buildRawContractEntry(
  config: unknown,
  outputDirOverride?: string
): LoadedConfigEntry | null {
  if (!isSyncContract(config)) {
    return null;
  }

  const outputDir = outputDirOverride ?? "./generated";
  const key = `${outputDir}`;
  return {
    contract: config,
    key,
    label: "contract",
    outputDir,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSyncContract(value: unknown): value is SyncContract {
  return (
    isRecord(value) &&
    Array.isArray(value.tables) &&
    Array.isArray(value.tablesMeta) &&
    isRecord(value.limits)
  );
}

function isGeneratorConfig(value: unknown): value is GeneratorConfig {
  return (
    isRecord(value) &&
    typeof value.outputDir === "string" &&
    isSyncContract(value.contract)
  );
}

export function handleGenerate(args: string[]): void {
  runGenerateCommand(args).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
