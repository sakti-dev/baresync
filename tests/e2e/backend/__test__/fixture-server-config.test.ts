import { describe, expect, it } from "vitest";
import { resolveFixtureBackendHost } from "../fixture-server-config";

describe("resolveFixtureBackendHost", () => {
  it("defaults to all interfaces so the phone can reach the backend", () => {
    expect(resolveFixtureBackendHost({})).toBe("0.0.0.0");
  });

  it("uses the configured host when provided", () => {
    expect(
      resolveFixtureBackendHost({
        BARESYNC_FIXTURE_BACKEND_HOST: "192.168.1.2",
      })
    ).toBe("192.168.1.2");
  });
});
