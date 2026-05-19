import path from "node:path";
import { runDiagnostics } from "./generator/diagnostics";
import { generateSyncArtifacts, SyncDiagnosticError } from "./generator/index";
import type { SyncContract } from "./schema/contract";

export async function runGenerate(
  configPathOrContract: string | SyncContract,
  outputDir: string,
  options?: { check?: boolean; warningsAsErrors?: boolean }
): Promise<void> {
  let contract: SyncContract;

  if (typeof configPathOrContract === "string") {
    const absPath = path.resolve(configPathOrContract);
    const configModule = await import(absPath);
    contract = configModule.default ?? configModule.contract;

    if (!contract) {
      throw new Error(
        `No default export or "contract" export found in ${absPath}`
      );
    }
  } else {
    contract = configPathOrContract;
  }

  if (options?.check) {
    const diagnostics = runDiagnostics(contract);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new SyncDiagnosticError(diagnostics);
    }
    return;
  }

  generateSyncArtifacts(contract, outputDir, {
    warningsAsErrors: options?.warningsAsErrors,
  });
}

export async function runDoctor(configPath: string): Promise<void> {
  const absPath = path.resolve(configPath);
  const configModule = await import(absPath);
  const contract: SyncContract = configModule.default ?? configModule.contract;

  if (!contract) {
    throw new Error(
      `No default export or "contract" export found in ${absPath}`
    );
  }

  const diagnostics = runDiagnostics(contract);

  for (const d of diagnostics) {
    let prefix = "INFO ";
    if (d.severity === "error") {
      prefix = "ERROR";
    } else if (d.severity === "warning") {
      prefix = "WARN ";
    }

    let location = "";
    if (d.table && d.column) {
      location = ` [${d.table}.${d.column}]`;
    } else if (d.table) {
      location = ` [${d.table}]`;
    }

    process.stdout.write(`${prefix} ${d.code}${location}: ${d.message}\n`);
    process.stdout.write(`       Why: ${d.why}\n`);
    process.stdout.write(`       Fix: ${d.fix}\n`);
    if (d.docs) {
      process.stdout.write(`       Docs: ${d.docs}\n`);
    }
  }

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.filter((d) => d.severity === "info");

  process.stdout.write(
    `\n${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s)\n`
  );

  if (errors.length > 0) {
    process.exit(1);
  }
}

function handleGenerate(args: string[]): void {
  let configPath: string | undefined;
  let outputDir: string | undefined;
  let check = false;
  let warningsAsErrors = false;

  for (const arg of args) {
    if (arg === "--check") {
      check = true;
    } else if (arg === "--warnings-as-errors") {
      warningsAsErrors = true;
    } else if (arg === "--output" || arg === "-o") {
      outputDir = arg;
    } else if (!configPath) {
      configPath = arg;
    }
  }

  if (!configPath) {
    process.stderr.write(
      "Usage: baresync generate <config-path> [--output <dir>] [--check] [--warnings-as-errors]\n"
    );
    process.exit(1);
  }

  runGenerate(configPath, outputDir ?? "./generated", {
    check,
    warningsAsErrors,
  }).catch(console.error);
}

function printUsage(): void {
  process.stderr.write(
    "Usage: baresync <doctor|generate> [options]\n\nCommands:\n  doctor <config-path>              Run diagnostics\n  generate <config-path> [options]   Generate sync artifacts\n\nGenerate options:\n  --output <dir>                    Output directory\n  --check                           Dry-run check only\n  --warnings-as-errors              Treat warnings as errors\n"
  );
  process.exit(1);
}

export function runCli(args: string[]): void {
  const command = args[0];

  if (command === "doctor") {
    const configPath = args[1];
    if (!configPath) {
      process.stderr.write("Usage: baresync doctor <config-path>\n");
      process.exit(1);
    }
    runDoctor(configPath).catch(console.error);
    return;
  }

  if (command === "generate") {
    handleGenerate(args.slice(1));
    return;
  }

  printUsage();
}

if (process.argv[1]?.endsWith("cli.ts")) {
  runCli(process.argv.slice(2));
}
