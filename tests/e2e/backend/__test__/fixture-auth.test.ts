import { describe, expect, it } from "vitest";
import {
  expectedFixtureAuthorization,
  requireFixtureAuthorization,
  resolveFixtureAuthToken,
} from "../fixture-auth";

describe("fixture auth", () => {
  it("trims and resolves the configured token", () => {
    expect(
      resolveFixtureAuthToken({
        BARESYNC_FIXTURE_AUTH_TOKEN: "  test-token  ",
      })
    ).toBe("test-token");
  });

  it("does not enforce auth when no token is configured", () => {
    const response = requireFixtureAuthorization(
      new Request("http://127.0.0.1:3001/status")
    );
    expect(response).toBeNull();
  });

  it("accepts a matching bearer token", () => {
    const request = new Request("http://127.0.0.1:3001/status", {
      headers: {
        authorization: expectedFixtureAuthorization("test-token"),
      },
    });

    expect(
      requireFixtureAuthorization(request, {
        BARESYNC_FIXTURE_AUTH_TOKEN: "test-token",
      })
    ).toBeNull();
  });

  it("rejects a missing bearer token when auth is enabled", async () => {
    const request = new Request("http://127.0.0.1:3001/status");

    const response = requireFixtureAuthorization(request, {
      BARESYNC_FIXTURE_AUTH_TOKEN: "test-token",
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "unauthorized" });
  });
});
