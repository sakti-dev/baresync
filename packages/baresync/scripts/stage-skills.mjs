import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const sourceDir = path.join(repoRoot, "skills", "baresync");
const stagingRoot = path.join(packageRoot, ".pack");
const stagingDir = path.join(stagingRoot, "skills", "baresync");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Skill source directory not found: ${sourceDir}`);
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(path.dirname(stagingDir), { recursive: true });
fs.cpSync(sourceDir, stagingDir, { recursive: true });
