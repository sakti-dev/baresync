// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  expectedInventoryAuthorization,
  requireInventoryAuthorization,
} from "./auth";

describe("inventory auth", () => {
  it("expects a bearer token from the demo auth env", () => {
    expect(expectedInventoryAuthorization("demo-token")).toBe(
      "Bearer demo-token"
    );
  });

  it("rejects requests without the expected auth header", () => {
    const request = new Request("http://localhost/api/sync/v1/status", {
      method: "POST",
    });

    expect(requireInventoryAuthorization(request, "demo-token")).toEqual({
      ok: false,
      status: 401,
      body: { error: "missing_or_invalid_authorization" },
    });
  });

  it("accepts requests with the expected auth header", () => {
    const request = new Request("http://localhost/api/sync/v1/status", {
      headers: {
        Authorization: "Bearer demo-token",
      },
      method: "POST",
    });

    expect(requireInventoryAuthorization(request, "demo-token")).toEqual({
      ok: true,
    });
  });
});
