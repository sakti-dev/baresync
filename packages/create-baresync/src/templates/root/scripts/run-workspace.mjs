import { spawn } from "node:child_process";
import path from "node:path";

const [workspace, script, ...args] = process.argv.slice(2);

if (!workspace || !script) {
  console.error("Usage: node ./scripts/run-workspace.mjs <workspace> <script> [args...]");
  process.exit(1);
}

const child = spawn("__PACKAGE_MANAGER__", ["run", script, ...args], {
  cwd: path.join(process.cwd(), workspace),
  shell: true,
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
