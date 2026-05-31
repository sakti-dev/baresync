import { describe, expect, it } from "vitest";
import {
  buildInstallApkCommand,
  buildUninstallAppCommand,
} from "./package-install";

describe("buildInstallApkCommand", () => {
  it("builds the adb install command for the selected device", () => {
    expect(
      buildInstallApkCommand("10DC920D900005V", "/tmp/app-release.apk")
    ).toEqual([
      "adb",
      "-s",
      "10DC920D900005V",
      "install",
      "-r",
      "/tmp/app-release.apk",
    ]);
  });
});

describe("buildUninstallAppCommand", () => {
  it("builds the adb uninstall command for the selected device", () => {
    expect(
      buildUninstallAppCommand("10DC920D900005V", "com.baresync.fixture")
    ).toEqual([
      "adb",
      "-s",
      "10DC920D900005V",
      "uninstall",
      "com.baresync.fixture",
    ]);
  });
});
