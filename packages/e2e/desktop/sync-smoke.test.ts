import { describe, expect, it } from "vitest";

describe.skip("desktop sync smoke", () => {
  it("has the local desktop smoke target configured", () => {
    expect(process.env.BARESYNC_DESKTOP_SMOKE_URL).toBeTruthy();
  });
});
