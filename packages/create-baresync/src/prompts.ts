import { cancel, isCancel, select, text } from "@clack/prompts";
import type { PackageManager, ServerFramework } from "./templates.js";

export async function promptProjectName(): Promise<string> {
  const projectName = await text({
    message: "What is the name of your Baresync project?",
    placeholder: "inventory-app",
    validate(value) {
      if (!value || value.length === 0) {
        return "Project name is required.";
      }
    },
  });

  if (isCancel(projectName)) {
    cancel("Scaffold cancelled.");
    process.exit(0);
  }

  return String(projectName);
}

export async function promptPackageManager(): Promise<PackageManager> {
  const packageManager = await select({
    message: "Which package manager do you want to use?",
    options: [
      { value: "bun", label: "Bun" },
      { value: "pnpm", label: "pnpm" },
      { value: "npm", label: "npm" },
      { value: "yarn", label: "yarn" },
    ],
  });

  if (isCancel(packageManager)) {
    cancel("Scaffold cancelled.");
    process.exit(0);
  }

  return packageManager as PackageManager;
}

export async function promptServerFramework(): Promise<ServerFramework> {
  const serverFramework = await select({
    message: "Which server framework do you want to scaffold?",
    options: [
      { value: "hono", label: "Hono" },
      { value: "elysia", label: "Elysia" },
    ],
  });

  if (isCancel(serverFramework)) {
    cancel("Scaffold cancelled.");
    process.exit(0);
  }

  return serverFramework as ServerFramework;
}
