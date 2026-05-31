import { afterEach, describe, expect, it } from "vitest";

const originalUserAgent = process.env.npm_config_user_agent;
const originalBun = process.versions.bun;

afterEach(() => {
  if (originalUserAgent === undefined) {
    Reflect.deleteProperty(process.env, "npm_config_user_agent");
  } else {
    process.env.npm_config_user_agent = originalUserAgent;
  }

  if (originalBun === undefined) {
    Object.defineProperty(process.versions, "bun", {
      configurable: true,
      value: undefined,
    });
  } else {
    Object.defineProperty(process.versions, "bun", {
      configurable: true,
      value: originalBun,
    });
  }
});

describe("detectPackageManager", () => {
  it("detects bun from the user agent", async () => {
    process.env.npm_config_user_agent = "bun/1.3.13 npm/? node/?";
    const { detectPackageManager } = await import("../package-manager.js");

    expect(detectPackageManager()).toBe("bun");
  });

  it("falls back to bun runtime when no user agent is present", async () => {
    Reflect.deleteProperty(process.env, "npm_config_user_agent");
    Object.defineProperty(process.versions, "bun", {
      configurable: true,
      value: "1.3.13",
    });

    const { detectPackageManager } = await import("../package-manager.js");

    expect(detectPackageManager()).toBe("bun");
  });
});
