import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SKILL_NAME = "baresync";
const OPENCODE_COMMAND_NAME = "baresync";
const OPENCODE_COMMAND_CONTENT = `---
description: OpenCode shortcut that loads the baresync skill
---

First load the \`baresync\` skill by calling \`skill({ name: "baresync" })\`.
Then handle the user's request below using that skill.

User prompt: $ARGUMENTS
`;

const PROJECT_HARNESS_DIRS = [
  ".claude",
  ".cursor",
  ".gemini",
  ".agents",
  ".github",
  ".kiro",
  ".opencode",
  ".pi",
  ".qoder",
  ".trae",
  ".trae-cn",
] as const;

const GLOBAL_HARNESS_HINTS: Array<{ home: string; provider: string }> = [
  { home: ".claude", provider: ".claude" },
  { home: ".codex", provider: ".agents" },
  { home: ".cursor", provider: ".cursor" },
  { home: ".gemini", provider: ".gemini" },
  { home: ".kiro", provider: ".kiro" },
  { home: ".opencode", provider: ".opencode" },
  { home: ".qoder", provider: ".qoder" },
];

const DEFAULT_TARGETS = [".claude", ".agents"];

export function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export function detectHarnesses(root: string): string[] {
  return PROJECT_HARNESS_DIRS.filter((dir) =>
    fs.existsSync(path.join(root, dir))
  );
}

function detectGlobalHarnesses(): string[] {
  const home = os.homedir();
  const found: string[] = [];
  for (const { home: h, provider } of GLOBAL_HARNESS_HINTS) {
    if (fs.existsSync(path.join(home, h)) && !found.includes(provider)) {
      found.push(provider);
    }
  }
  return found;
}

export function resolveInstallTargets(
  root: string,
  providersFlag?: string
): string[] {
  if (providersFlag) {
    return [
      ...new Set(
        providersFlag
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => (s.startsWith(".") ? s : `.${s}`))
      ),
    ];
  }

  const inProject = detectHarnesses(root);
  if (inProject.length > 0) {
    return inProject;
  }

  const global = detectGlobalHarnesses();
  if (global.length > 0) {
    return global;
  }

  return [...DEFAULT_TARGETS];
}

export function getSkillSourceDir(): string {
  // Walk up from current file looking for the packaged or workspace skill source at any level
  let dir = path.resolve(import.meta.dirname);
  while (dir !== path.dirname(dir)) {
    // Check for the staged publish layout first when running from an installed package
    if (fs.existsSync(path.join(dir, "package.json"))) {
      const staged = path.join(dir, ".pack", "skills", SKILL_NAME);
      if (fs.existsSync(staged)) {
        return staged;
      }

      const packaged = path.join(dir, "skills", SKILL_NAME);
      if (fs.existsSync(packaged)) {
        return packaged;
      }
    }
    // Check for skills/baresync/ with .git (monorepo root)
    if (fs.existsSync(path.join(dir, ".git"))) {
      const source = path.join(dir, "skills", SKILL_NAME);
      if (fs.existsSync(source)) {
        return source;
      }
    }
    dir = path.dirname(dir);
  }

  throw new Error(
    "Could not find baresync skill files. Run 'bunx baresync skills install' from the project root."
  );
}

export function installSkills(
  targets: string[],
  skillSourceDir: string,
  root: string
): number {
  let written = 0;
  for (const provider of targets) {
    const destDir = path.join(root, provider, "skills", SKILL_NAME);
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(skillSourceDir, destDir, { recursive: true });
    if (provider === ".opencode") {
      const commandDir = path.join(root, provider, "commands");
      fs.mkdirSync(commandDir, { recursive: true });
      fs.writeFileSync(
        path.join(commandDir, `${OPENCODE_COMMAND_NAME}.md`),
        OPENCODE_COMMAND_CONTENT
      );
    }
    written++;
  }
  return written;
}

export function updateSkills(
  targets: string[],
  skillSourceDir: string,
  root: string
): number {
  let updated = 0;
  for (const provider of targets) {
    const destDir = path.join(root, provider, "skills", SKILL_NAME);
    if (!fs.existsSync(destDir)) {
      continue;
    }
    fs.cpSync(skillSourceDir, destDir, { recursive: true });
    if (provider === ".opencode") {
      const commandDir = path.join(root, provider, "commands");
      fs.mkdirSync(commandDir, { recursive: true });
      fs.writeFileSync(
        path.join(commandDir, `${OPENCODE_COMMAND_NAME}.md`),
        OPENCODE_COMMAND_CONTENT
      );
    }
    updated++;
  }
  return updated;
}

export function findInstalledSkillDirs(root: string): string[] {
  const found: string[] = [];
  for (const dir of PROJECT_HARNESS_DIRS) {
    const skillDir = path.join(root, dir, "skills", SKILL_NAME);
    if (
      fs.existsSync(skillDir) &&
      fs.existsSync(path.join(skillDir, "SKILL.md"))
    ) {
      found.push(dir);
    }
  }
  return found;
}
