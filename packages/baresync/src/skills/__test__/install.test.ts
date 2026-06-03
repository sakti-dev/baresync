import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectHarnesses,
  findInstalledSkillDirs,
  findProjectRoot,
  installSkills,
  resolveInstallTargets,
  updateSkills,
} from "../install";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "baresync-skills-test-"));
}

function createHarnessDir(root: string, name: string): void {
  fs.mkdirSync(path.join(root, name), { recursive: true });
}

const SKILL_SOURCE = path.resolve(
  import.meta.dirname,
  "../../../../../skills/baresync"
);

describe("findProjectRoot", () => {
  it("returns directory containing .git", () => {
    const tmp = createTempDir();
    const sub = path.join(tmp, "apps", "app");
    fs.mkdirSync(sub, { recursive: true });
    fs.mkdirSync(path.join(tmp, ".git"));

    const original = process.cwd();
    process.chdir(sub);
    try {
      const root = findProjectRoot();
      expect(root).toBe(tmp);
    } finally {
      process.chdir(original);
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe("detectHarnesses", () => {
  it("detects harness directories in project root", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".claude");
    createHarnessDir(tmp, ".cursor");
    createHarnessDir(tmp, "src");

    const found = detectHarnesses(tmp);
    expect(found).toContain(".claude");
    expect(found).toContain(".cursor");
    expect(found).not.toContain("src");

    fs.rmSync(tmp, { recursive: true });
  });

  it("returns empty array when no harnesses found", () => {
    const tmp = createTempDir();
    const found = detectHarnesses(tmp);
    expect(found).toEqual([]);

    fs.rmSync(tmp, { recursive: true });
  });
});

describe("resolveInstallTargets", () => {
  it("uses --providers flag when given", () => {
    const tmp = createTempDir();
    const targets = resolveInstallTargets(tmp, ".claude,.cursor");
    expect(targets).toEqual([".claude", ".cursor"]);

    fs.rmSync(tmp, { recursive: true });
  });

  it("normalizes providers without dot prefix", () => {
    const tmp = createTempDir();
    const targets = resolveInstallTargets(tmp, "claude,cursor");
    expect(targets).toEqual([".claude", ".cursor"]);

    fs.rmSync(tmp, { recursive: true });
  });

  it("detects project harnesses when no flag given", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".opencode");
    createHarnessDir(tmp, ".gemini");

    const targets = resolveInstallTargets(tmp);
    expect(targets).toContain(".opencode");
    expect(targets).toContain(".gemini");

    fs.rmSync(tmp, { recursive: true });
  });

  it("falls back to global or defaults when nothing in project", () => {
    const tmp = createTempDir();
    const targets = resolveInstallTargets(tmp);
    // Should return at least .claude and .agents (either from global detection or defaults)
    expect(targets).toContain(".claude");
    expect(targets).toContain(".agents");
    expect(targets.length).toBeGreaterThanOrEqual(2);

    fs.rmSync(tmp, { recursive: true });
  });
});

describe("installSkills", () => {
  it("copies skill files to target directories", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".claude");

    const written = installSkills([".claude"], SKILL_SOURCE, tmp);
    expect(written).toBe(1);

    const skillMd = path.join(tmp, ".claude", "skills", "baresync", "SKILL.md");
    expect(fs.existsSync(skillMd)).toBe(true);

    const refDir = path.join(tmp, ".claude", "skills", "baresync", "reference");
    expect(fs.existsSync(refDir)).toBe(true);
    expect(fs.readdirSync(refDir).length).toBeGreaterThan(0);

    fs.rmSync(tmp, { recursive: true });
  });

  it("adds an OpenCode /baresync command only for .opencode installs", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".opencode");
    createHarnessDir(tmp, ".claude");

    const written = installSkills([".opencode", ".claude"], SKILL_SOURCE, tmp);
    expect(written).toBe(2);

    const commandPath = path.join(tmp, ".opencode", "commands", "baresync.md");
    expect(fs.existsSync(commandPath)).toBe(true);
    expect(fs.readFileSync(commandPath, "utf-8")).toContain(
      'skill({ name: "baresync" })'
    );
    expect(fs.readFileSync(commandPath, "utf-8")).toContain(
      "User prompt: $ARGUMENTS"
    );

    expect(
      fs.existsSync(path.join(tmp, ".claude", "commands", "baresync.md"))
    ).toBe(false);

    fs.rmSync(tmp, { recursive: true });
  });

  it("copies to multiple targets", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".claude");
    createHarnessDir(tmp, ".cursor");

    const written = installSkills([".claude", ".cursor"], SKILL_SOURCE, tmp);
    expect(written).toBe(2);

    expect(
      fs.existsSync(path.join(tmp, ".claude", "skills", "baresync", "SKILL.md"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmp, ".cursor", "skills", "baresync", "SKILL.md"))
    ).toBe(true);

    fs.rmSync(tmp, { recursive: true });
  });
});

describe("updateSkills", () => {
  it("overwrites existing skill files", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".claude");

    // Install first
    installSkills([".claude"], SKILL_SOURCE, tmp);

    // Modify the file
    const skillMd = path.join(tmp, ".claude", "skills", "baresync", "SKILL.md");
    fs.writeFileSync(skillMd, "modified");
    expect(fs.readFileSync(skillMd, "utf-8")).toBe("modified");

    // Update should overwrite
    const updated = updateSkills([".claude"], SKILL_SOURCE, tmp);
    expect(updated).toBe(1);
    expect(fs.readFileSync(skillMd, "utf-8")).not.toBe("modified");

    fs.rmSync(tmp, { recursive: true });
  });

  it("skips targets that are not installed", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".claude");
    createHarnessDir(tmp, ".cursor");

    // Only install to .claude
    installSkills([".claude"], SKILL_SOURCE, tmp);

    // Update both — .cursor should be skipped
    const updated = updateSkills([".claude", ".cursor"], SKILL_SOURCE, tmp);
    expect(updated).toBe(1);

    fs.rmSync(tmp, { recursive: true });
  });
});

describe("findInstalledSkillDirs", () => {
  it("finds directories with installed skills", () => {
    const tmp = createTempDir();
    createHarnessDir(tmp, ".claude");
    createHarnessDir(tmp, ".cursor");
    installSkills([".claude"], SKILL_SOURCE, tmp);

    const found = findInstalledSkillDirs(tmp);
    expect(found).toContain(".claude");
    expect(found).not.toContain(".cursor");

    fs.rmSync(tmp, { recursive: true });
  });

  it("returns empty when nothing installed", () => {
    const tmp = createTempDir();
    const found = findInstalledSkillDirs(tmp);
    expect(found).toEqual([]);

    fs.rmSync(tmp, { recursive: true });
  });
});
