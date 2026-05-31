import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const commands = [
  {
    name: "server",
    cwd: path.join(root, "apps/server"),
    args: ["run", "dev"],
  },
  {
    name: "app",
    cwd: path.join(root, "apps/app"),
    args: ["run", "tauri:dev"],
  },
];

const children = commands.map((command) =>
  spawn("__PACKAGE_MANAGER__", command.args, {
    cwd: command.cwd,
    shell: true,
    stdio: "inherit",
  })
);

let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

for (const child of children) {
  child.on("close", (code) => {
    if (code && code !== 0) {
      finish(code);
      return;
    }

    if (children.every((item) => item.exitCode !== null || item.signalCode !== null)) {
      finish(0);
    }
  });
}
