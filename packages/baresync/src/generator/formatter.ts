import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

export interface GeneratedFormatInput {
  projectDir: string;
  rust?: string[];
  tsAndJson?: string[];
}

const BIOME_CONFIG_NAMES = ["biome.json", "biome.jsonc", "biome.json5"];
const OXFMT_CONFIG_NAMES = [
  ".oxlintrc.json",
  "oxlint.json",
  "oxlint.config.json",
];

export function formatGeneratedArtifacts(input: GeneratedFormatInput): void {
  const tsAndJson = input.tsAndJson ?? [];
  const rust = input.rust ?? [];

  if (tsAndJson.length > 0) {
    formatGeneratedTsAndJson(input.projectDir, tsAndJson);
  }

  for (const filePath of rust) {
    formatGeneratedRust(filePath);
  }
}

function formatGeneratedTsAndJson(
  projectDir: string,
  pathsToFormat: string[]
): void {
  const biomeConfig = findUp(projectDir, BIOME_CONFIG_NAMES);
  const biomeBin = findLocalBin(projectDir, "biome");
  if (biomeConfig && biomeBin) {
    const biomeFormatted = runFormatter(biomeBin, [
      "format",
      "--write",
      "--config-path",
      biomeConfig,
      ...pathsToFormat,
    ]);
    if (biomeFormatted) {
      return;
    }
  }

  const oxfmtConfig = findUp(projectDir, OXFMT_CONFIG_NAMES);
  const oxfmtBin = findLocalBin(projectDir, "oxfmt");
  if (oxfmtConfig && oxfmtBin) {
    runFormatterOrThrow(oxfmtBin, ["--write", ...pathsToFormat]);
    return;
  }

  runBundledPrettier(pathsToFormat);
}

function formatGeneratedRust(filePath: string): void {
  const result = spawnSync("rustfmt", ["--edition", "2021", filePath], {
    stdio: "inherit",
  });

  if (isMissingCommand(result.error)) {
    return;
  }

  if (result.status !== 0) {
    throw new Error("Failed to format generated Rust protobuf output");
  }
}

function runBundledPrettier(pathsToFormat: string[]): void {
  const prettierBin = require.resolve("prettier/bin/prettier.cjs");
  runFormatterOrThrow(process.execPath, [
    prettierBin,
    "--write",
    ...pathsToFormat,
  ]);
}

function runFormatter(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (isMissingCommand(result.error)) {
    return false;
  }

  if (result.status === 0) {
    return true;
  }

  if (shouldFallbackToPrettier(result.stderr)) {
    return false;
  }

  throw new Error(`Failed to format generated artifacts with ${command}`);
}

function shouldFallbackToPrettier(stderr: string | null): boolean {
  if (!stderr) {
    return false;
  }

  return (
    stderr.includes("No files were processed in the specified paths") ||
    stderr.includes("These paths were provided but ignored:")
  );
}

function runFormatterOrThrow(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (isMissingCommand(result.error)) {
    return;
  }

  if (result.status !== 0) {
    throw new Error(`Failed to format generated artifacts with ${command}`);
  }
}

function findLocalBin(startDir: string, name: string): string | null {
  let currentDir = path.resolve(startDir);
  const binaryName = process.platform === "win32" ? `${name}.cmd` : name;

  while (true) {
    const candidate = path.join(currentDir, "node_modules", ".bin", binaryName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function findUp(startDir: string, fileNames: readonly string[]): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    for (const fileName of fileNames) {
      const candidate = path.join(currentDir, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function isMissingCommand(error: Error | undefined): boolean {
  return Boolean(error && "code" in error && error.code === "ENOENT");
}
