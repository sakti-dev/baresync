#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleGenerate, runDoctorCommand } from "./generator";
import { runSkillsCommand } from "./skills";

function printUsage(): void {
  process.stderr.write(
    "Usage: baresync <doctor|generate|skills> [options]\n\nCommands:\n  doctor [config-path]              Run diagnostics\n  generate [config-path] [options]  Generate sync artifacts\n  skills <install|update>           Manage AI agent skills\n\nGenerate options:\n  --config <path>                   Explicit config file\n  --output <dir>                    Output directory\n  --check                           Dry-run check only\n  --warnings-as-errors              Treat warnings as errors\n\nSkills options:\n  --yes                             Skip confirmation prompt\n  --providers <dirs>                Comma-separated harness dirs (e.g. .claude,.cursor)\n"
  );
  process.exit(1);
}

export function runCli(args: string[]): void {
  const command = args[0];

  if (command === "doctor") {
    runDoctorCommand(args.slice(1)).catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
    return;
  }

  if (command === "generate") {
    handleGenerate(args.slice(1));
    return;
  }

  if (command === "skills") {
    runSkillsCommand(args.slice(1)).catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
    return;
  }

  printUsage();
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli(process.argv.slice(2));
}
