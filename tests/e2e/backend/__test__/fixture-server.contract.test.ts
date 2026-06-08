import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
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

describe("fixture-server baseline cursor contract", () => {
  const fixtureServerScript = path.resolve("backend/fixture-server.ts");
  it("returns a non-empty watermark cursor for empty pull and status responses", async () => {
    const { backend, baseUrl } = await startFixtureBackend(fixtureServerScript);

    try {
      const pullResponse = await fetch(`${baseUrl}/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cursor: "",
          scopeId: "merchant-1",
          tables: [],
        }),
      });

      expect(pullResponse.ok).toBe(true);
      const pullBody = (await pullResponse.json()) as {
        cursor: string;
        hasMore: boolean;
        serverTime: string;
        tables: unknown[];
      };
      expect(pullBody.cursor.startsWith("sync:")).toBe(true);
      expect(pullBody.cursor).toContain(":__watermark__:__scope__");
      expect(pullBody.hasMore).toBe(false);
      expect(pullBody.tables).toEqual([
        { table: "categories", changedRows: [], deletedIds: [] },
        { table: "products", changedRows: [], deletedIds: [] },
      ]);

      const statusResponse = await fetch(`${baseUrl}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cursor: "",
          scopeId: "merchant-1",
        }),
      });

      expect(statusResponse.ok).toBe(true);
      const statusBody = (await statusResponse.json()) as {
        changedTables: string[];
        cursor: string;
        hasChanges: boolean;
        serverTime: string;
      };
      expect(statusBody.cursor.startsWith("sync:")).toBe(true);
      expect(statusBody.cursor).toContain(":__watermark__:__scope__");
      expect(statusBody.changedTables).toEqual([]);
      expect(statusBody.hasChanges).toBe(false);
    } finally {
      backend.kill("SIGTERM");
    }
  });
});

async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate port")));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function startFixtureBackend(fixtureServerScript: string): Promise<{
  backend: ChildProcess;
  baseUrl: string;
}> {
  const port = await getAvailablePort();
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "baresync-fixture-contract-")
  );
  const dbPath = path.join(tempDir, "fixture.db");
  const env = {
    ...process.env,
    BARESYNC_FIXTURE_BACKEND_PORT: String(port),
    BARESYNC_FIXTURE_DB_PATH: dbPath,
    BARESYNC_FIXTURE_ENCODING: "json",
    BARESYNC_FIXTURE_START_EMPTY: "true",
  };

  const backend = spawn("bun", ["run", fixtureServerScript], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  backend.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForBackend(baseUrl);

  return { backend, baseUrl };
}

async function waitForBackend(baseUrlToCheck: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrlToCheck}/__state`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected backend status: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Fixture backend did not become ready in time");
}
