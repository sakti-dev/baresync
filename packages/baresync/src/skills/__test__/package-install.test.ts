import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../..");
const PACKAGE_NAME = "baresync";
const SKILL_SOURCE = path.join(PACKAGE_ROOT, "skills", "baresync");

const createdTempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-pack-test-"));
  createdTempDirs.push(dir);
  return dir;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, CI: "1" },
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}

function expectCommandSuccess(result: {
  stdout: string;
  stderr: string;
  status: number | null;
}): void {
  expect(result.status, `${result.stdout}\n${result.stderr}`.trim()).toBe(0);
}

function parseNpmPackOutput(stdout: string): Array<{
  filename: string;
  files: Array<{ path: string }>;
}> {
  const jsonStart = stdout.lastIndexOf("\n[");
  const jsonText = stdout.slice(jsonStart >= 0 ? jsonStart + 1 : 0).trim();
  return JSON.parse(jsonText) as Array<{
    filename: string;
    files: Array<{ path: string }>;
  }>;
}

afterEach(() => {
  for (const dir of createdTempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  for (const file of fs.readdirSync(PACKAGE_ROOT)) {
    if (file.startsWith(`${PACKAGE_NAME}-`) && file.endsWith(".tgz")) {
      fs.rmSync(path.join(PACKAGE_ROOT, file), { force: true });
    }
  }
});

describe("packaged skills install", () => {
  it("includes publish-script staged skills when package scripts are ignored", () => {
    const tmp = createTempDir();

    fs.cpSync(
      path.join(PACKAGE_ROOT, "package.json"),
      path.join(tmp, "package.json")
    );
    fs.cpSync(
      path.join(PACKAGE_ROOT, "README.md"),
      path.join(tmp, "README.md")
    );
    fs.cpSync(path.join(PACKAGE_ROOT, "LICENSE"), path.join(tmp, "LICENSE"));
    fs.mkdirSync(path.join(tmp, "dist", "cli"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "dist", "cli", "index.js"), "");
    fs.mkdirSync(path.join(tmp, "skills"), { recursive: true });
    fs.cpSync(SKILL_SOURCE, path.join(tmp, "skills", "baresync"), {
      recursive: true,
    });

    const packResult = runCommand(
      "npm",
      ["pack", "--json", "--ignore-scripts"],
      tmp
    );
    expectCommandSuccess(packResult);

    const [packed] = parseNpmPackOutput(packResult.stdout);

    expect(
      packed.files.some((file) => file.path === "skills/baresync/SKILL.md")
    ).toBe(true);
    expect(
      packed.files.some(
        (file) => file.path === ".pack/skills/baresync/SKILL.md"
      )
    ).toBe(false);
    expect(
      packed.files.some((file) =>
        file.path.startsWith("skills/baresync/reference/")
      )
    ).toBe(false);
  });

  it("installs baresync skills from the packed npm tarball", () => {
    const packResult = runCommand("npm", ["pack", "--json"], PACKAGE_ROOT);
    expectCommandSuccess(packResult);

    const [packed] = parseNpmPackOutput(packResult.stdout);

    expect(packed.files.some((file) => file.path === "dist/cli/index.js")).toBe(
      true
    );
    expect(
      packed.files.some((file) => file.path === "skills/baresync/SKILL.md")
    ).toBe(true);

    const tarballPath = path.join(PACKAGE_ROOT, packed.filename);
    const tmp = createTempDir();
    const extractRoot = path.join(tmp, "extract");
    const projectRoot = path.join(tmp, "project");

    fs.mkdirSync(extractRoot, { recursive: true });
    fs.mkdirSync(path.join(projectRoot, ".git"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, ".agents"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, ".opencode"), { recursive: true });

    const extractResult = runCommand(
      "tar",
      ["-xzf", tarballPath, "-C", extractRoot],
      PACKAGE_ROOT
    );
    expectCommandSuccess(extractResult);

    fs.symlinkSync(
      path.join(PACKAGE_ROOT, "node_modules"),
      path.join(extractRoot, "package", "node_modules"),
      "dir"
    );

    const installResult = runCommand(
      "node",
      [
        path.join(extractRoot, "package", "dist", "cli", "index.js"),
        "skills",
        "install",
        "--yes",
        "--providers",
        ".claude,.agents,.opencode",
      ],
      projectRoot
    );
    expectCommandSuccess(installResult);

    expect(
      fs.existsSync(
        path.join(projectRoot, ".claude", "skills", "baresync", "SKILL.md")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectRoot, ".agents", "skills", "baresync", "SKILL.md")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectRoot, ".opencode", "skills", "baresync", "SKILL.md")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectRoot, ".opencode", "commands", "baresync.md")
      )
    ).toBe(true);
  }, 30_000);
});
