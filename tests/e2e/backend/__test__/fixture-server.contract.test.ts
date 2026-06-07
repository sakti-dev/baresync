import { describe, expect, it } from "vitest";
import {
  expectedFixtureAuthorization,
  requireFixtureAuthorization,
} from "../fixture-auth";

describe("fixture-server auth contract", () => {
  it("accepts the configured bearer token", () => {
    const request = new Request("http://127.0.0.1:3001/status", {
      headers: {
        authorization: expectedFixtureAuthorization("contract-token"),
      },
    });

    expect(
      requireFixtureAuthorization(request, {
        BARESYNC_FIXTURE_AUTH_TOKEN: "contract-token",
      })
    ).toBeNull();
  });

  it("rejects missing auth when the backend is configured to require it", async () => {
    const response = requireFixtureAuthorization(
      new Request("http://127.0.0.1:3001/status"),
      {
        BARESYNC_FIXTURE_AUTH_TOKEN: "contract-token",
      }
    );

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "unauthorized" });
  });
});
