import type { PackageManager } from "./templates.js";

export function detectPackageManager(): PackageManager | null {
  const userAgent = process.env.npm_config_user_agent ?? "";

  if (userAgent.includes("bun")) {
    return "bun";
  }

  if (userAgent.includes("pnpm")) {
    return "pnpm";
  }

  if (userAgent.includes("yarn")) {
    return "yarn";
  }

  if (userAgent.includes("npm")) {
    return "npm";
  }

  if (typeof process.versions.bun === "string") {
    return "bun";
  }

  return null;
}
