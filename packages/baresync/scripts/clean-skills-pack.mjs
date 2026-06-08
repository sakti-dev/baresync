import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const stagingRoot = path.join(packageRoot, ".pack");

fs.rmSync(stagingRoot, { recursive: true, force: true });
