import { describe, expect, it } from "vitest";
import { buildAndroidBuildArgs } from "./build-fixture";

describe("buildAndroidBuildArgs", () => {
  it("uses the release profile for Android smoke builds", () => {
    expect(buildAndroidBuildArgs("aarch64", "sqlcipher")).toEqual([
      "bun",
      "x",
      "@tauri-apps/cli",
      "android",
      "build",
      "--apk",
      "--target",
      "aarch64",
      "--ci",
      "--features",
      "sqlcipher",
    ]);
  });
});
