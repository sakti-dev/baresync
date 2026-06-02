import {
  findInstalledSkillDirs,
  findProjectRoot,
  getSkillSourceDir,
  installSkills,
  resolveInstallTargets,
  updateSkills,
} from "../skills/install";

interface SkillsFlags {
  providers?: string;
  yes: boolean;
}

function parseSkillsFlags(args: string[]): SkillsFlags {
  const flags: SkillsFlags = { yes: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
      continue;
    }
    if (arg.startsWith("--providers=")) {
      flags.providers = arg.slice("--providers=".length);
      continue;
    }
    if (arg === "--providers" && args[i + 1]) {
      flags.providers = args[i + 1];
      i++;
    }
  }
  return flags;
}

async function runSkillsInstall(args: string[]): Promise<void> {
  const flags = parseSkillsFlags(args);
  const root = findProjectRoot();
  const targets = resolveInstallTargets(root, flags.providers);
  const skillSourceDir = getSkillSourceDir();

  if (!flags.yes) {
    const { confirm } = await import("@clack/prompts");
    const confirmed = await confirm({
      message: `Install baresync skill into ${targets.length} folder(s)? (${targets.join(", ")})`,
    });
    if (!confirmed) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  const written = installSkills(targets, skillSourceDir, root);
  process.stdout.write(
    `Installed baresync skill into: ${targets.join(", ")} (${written} folder(s))\n`
  );
}

async function runSkillsUpdate(args: string[]): Promise<void> {
  const flags = parseSkillsFlags(args);
  const root = findProjectRoot();
  const installed = findInstalledSkillDirs(root);

  if (installed.length === 0) {
    process.stdout.write(
      "No baresync skill found. Run `bunx baresync skills install` first.\n"
    );
    return;
  }

  const targets = flags.providers
    ? resolveInstallTargets(root, flags.providers)
    : installed;
  const skillSourceDir = getSkillSourceDir();

  if (!flags.yes) {
    const { confirm } = await import("@clack/prompts");
    const confirmed = await confirm({
      message: `Update baresync skill in ${targets.length} folder(s)? (${targets.join(", ")})`,
    });
    if (!confirmed) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  const updated = updateSkills(targets, skillSourceDir, root);
  process.stdout.write(
    `Updated baresync skill in ${updated} folder(s): ${targets.join(", ")}\n`
  );
}

export async function runSkillsCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(
      "Usage: baresync skills <install|update> [options]\n\nCommands:\n  install   Install baresync skill into detected AI harness directories\n  update    Update installed baresync skill to current version\n\nOptions:\n  --yes                 Skip confirmation prompt\n  --providers <dirs>    Comma-separated harness dirs (e.g. .claude,.cursor)\n"
    );
    return;
  }

  if (sub === "install") {
    await runSkillsInstall(args.slice(1));
    return;
  }

  if (sub === "update") {
    await runSkillsUpdate(args.slice(1));
    return;
  }

  process.stderr.write(`Unknown skills command: ${sub}\n`);
  process.stderr.write(
    "Run 'baresync skills --help' for available commands.\n"
  );
  process.exitCode = 1;
}
