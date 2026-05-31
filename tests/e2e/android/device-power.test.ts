import { describe, expect, it } from "vitest";
import {
  buildAnimationScaleCommand,
  buildScreenTimeoutCommand,
  buildStayAwakeCommand,
} from "./device-power";

describe("buildStayAwakeCommand", () => {
  it("builds the adb command to keep the device awake over usb", () => {
    expect(buildStayAwakeCommand("10DC920D900005V", true)).toEqual([
      "adb",
      "-s",
      "10DC920D900005V",
      "shell",
      "svc",
      "power",
      "stayon",
      "usb",
    ]);
  });

  it("builds the adb command to restore normal sleep behavior", () => {
    expect(buildStayAwakeCommand("10DC920D900005V", false)).toEqual([
      "adb",
      "-s",
      "10DC920D900005V",
      "shell",
      "svc",
      "power",
      "stayon",
      "false",
    ]);
  });

  it("builds the adb command to extend the screen timeout", () => {
    expect(buildScreenTimeoutCommand("10DC920D900005V", 3_600_000)).toEqual([
      "adb",
      "-s",
      "10DC920D900005V",
      "shell",
      "settings",
      "put",
      "system",
      "screen_off_timeout",
      "3600000",
    ]);
  });

  it("builds adb commands to disable Android system animations", () => {
    expect(buildAnimationScaleCommand("10DC920D900005V", 0)).toEqual([
      "adb",
      "-s",
      "10DC920D900005V",
      "shell",
      "settings",
      "put",
      "global",
      "window_animation_scale",
      "0",
      ";",
      "settings",
      "put",
      "global",
      "transition_animation_scale",
      "0",
      ";",
      "settings",
      "put",
      "global",
      "animator_duration_scale",
      "0",
    ]);
  });
});
