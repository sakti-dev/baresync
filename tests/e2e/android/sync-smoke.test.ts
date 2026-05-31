import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Android sync smoke flow", () => {
  const smokeYaml = readFileSync(
    resolve(import.meta.dirname, "sync-smoke.yaml"),
    "utf8"
  );
  const fixtureHtml = readFileSync(
    resolve(import.meta.dirname, "../../fixture-app/index.html"),
    "utf8"
  );
  const e2ePackageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")
  ) as { scripts: Record<string, string> };

  it("avoids expensive physical-device animation waits and manual swipes", () => {
    expect(smokeYaml).not.toContain("waitForAnimationToEnd");
    expect(smokeYaml).not.toContain("- swipe:");
  });

  it("disables settle waiting for button taps", () => {
    expect(smokeYaml).toContain("waitToSettleTimeoutMs: 0");
  });

  it("keeps smoke controls before the large sync result output", () => {
    expect(fixtureHtml.indexOf('id="create-row"')).toBeLessThan(
      fixtureHtml.indexOf('id="sync-result"')
    );
    expect(fixtureHtml.indexOf('id="manual-sync"')).toBeLessThan(
      fixtureHtml.indexOf('id="sync-result"')
    );
    expect(fixtureHtml.indexOf('id="smoke-state"')).toBeLessThan(
      fixtureHtml.indexOf('id="sync-result"')
    );
  });

  it("exposes a direct ADB smoke runner for physical-device sync checks", () => {
    expect(e2ePackageJson.scripts["android:adb-sync:json"]).toContain(
      "android/run-adb-smoke.ts"
    );
  });
});
