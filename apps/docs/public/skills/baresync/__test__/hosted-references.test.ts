import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DOCS_PUBLIC = path.resolve(import.meta.dirname, "../../..");
const SKILLS_BASE = path.join(DOCS_PUBLIC, "skills", "baresync");
const LEADING_SLASH_RE = /^\//;
const REQUIRED_PACKAGES = [
  "baresync",
  "create-baresync",
  "baresync-core",
  "tauri-plugin-baresync",
];

interface Manifest {
  compatiblePackages: Record<string, string>;
  name: string;
  references: Record<string, string>;
  referenceVersion: string;
}

interface SkillConfig {
  docsBaseUrl: string;
  fallbackRawBaseUrl: string;
  referencesBasePath: string;
  schemaVersion: number;
}

function loadConfig(): SkillConfig {
  const configPath = path.join(SKILLS_BASE, "config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as SkillConfig;
}

function loadManifest(versionDir: string): Manifest {
  const manifestPath = path.join(versionDir, "manifest.json");
  const raw = fs.readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as Manifest;
}

describe("hosted skill references", () => {
  it("config declares the docs domain and raw GitHub fallback", () => {
    const config = loadConfig();
    expect(config.schemaVersion).toBe(1);
    expect(config.docsBaseUrl).toBe("https://baresync.hieka.id");
    expect(config.referencesBasePath).toBe("/skills/baresync");
    expect(config.fallbackRawBaseUrl).toBe(
      "https://raw.githubusercontent.com/sakti-dev/baresync/main/apps/docs/public/skills/baresync"
    );
  });

  it("0.4 manifest exists and is valid JSON", () => {
    const manifest = loadManifest(path.join(SKILLS_BASE, "0.4"));
    expect(manifest.name).toBe("baresync");
    expect(manifest.referenceVersion).toBe("0.4");
  });

  it("latest manifest exists and points to a concrete reference line", () => {
    const manifest = loadManifest(path.join(SKILLS_BASE, "latest"));
    expect(manifest.name).toBe("baresync");
    expect(manifest.referenceVersion).toBe("0.4");
  });

  it("every manifest reference URL maps to an existing Markdown file", () => {
    const versions = ["0.4", "latest"];
    for (const version of versions) {
      const manifest = loadManifest(path.join(SKILLS_BASE, version));
      for (const [key, url] of Object.entries(manifest.references)) {
        const filePath = path.join(
          DOCS_PUBLIC,
          url.replace(LEADING_SLASH_RE, "")
        );
        expect(
          fs.existsSync(filePath),
          `Reference '${key}' (${url}) for version ${version} does not exist at ${filePath}`
        ).toBe(true);
      }
    }
  });

  it("each manifest declares compatible package ranges for all four packages", () => {
    const versions = ["0.4", "latest"];
    for (const version of versions) {
      const manifest = loadManifest(path.join(SKILLS_BASE, version));
      for (const pkg of REQUIRED_PACKAGES) {
        expect(
          manifest.compatiblePackages[pkg],
          `Manifest for ${version} missing compatiblePackages.${pkg}`
        ).toBeDefined();
      }
    }
  });
});
