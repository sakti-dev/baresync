import fs from "node:fs/promises";
import path from "node:path";

export interface ScaffoldFile {
  content: string;
  executable?: boolean;
  path: string;
}

export async function writeScaffoldFiles(
  rootDir: string,
  files: readonly ScaffoldFile[]
): Promise<void> {
  for (const file of files) {
    const absPath = path.join(rootDir, file.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, file.content, "utf8");
    if (file.executable) {
      await fs.chmod(absPath, 0o755);
    }
  }
}

export async function ensureEmptyTargetDir(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(targetDir);
  if (entries.length > 0) {
    throw new Error(
      `Target directory is not empty: ${targetDir}. Choose an empty directory or a new project name.`
    );
  }
}

export async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}
