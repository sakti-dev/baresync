import { type ChildProcess, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import {
  decodeProtobufBody,
  encodeProtobufBody,
  SYNC_PROTOBUF_SCHEMA,
  type SyncProtobufSchema,
} from "../../generated/protobuf/runtime.generated";

type Encoding = "json" | "protobuf";

interface Row extends Record<string, unknown> {
  deletedAt: string | null;
  id: string;
}

interface TablePayload {
  changedRows: Row[];
  deletedIds: string[];
  table: string;
}

interface SyncStatusResponse {
  changedTables: string[];
  cursor: string;
  hasChanges: boolean;
  serverTime: string;
}

interface SyncPullResponse {
  cursor: string;
  hasMore: boolean;
  serverTime: string;
  tables: TablePayload[];
}

interface SyncPushResponse {
  serverTime: string;
  tables: Array<{
    acceptedCreatedIds: string[];
    acceptedDeletedIds: string[];
    acceptedUpdatedIds: string[];
    rejected: Array<{ id: string; reason: string }>;
    table: string;
  }>;
}

interface FixtureState {
  categories: Row[];
  products: Row[];
  pushed: {
    categories: Row[];
    products: Row[];
  };
  scopeId: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eRoot = path.resolve(__dirname, "../..");
const fixtureServerScript = path.join("backend", "fixture-server.ts");
const scopeId = "merchant-1";
const serverTime = "2026-05-20T00:00:00.000Z";
const protobufSchema = SYNC_PROTOBUF_SCHEMA as unknown as SyncProtobufSchema;

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Failed to allocate a free port"));
      });
    });
  });
}

function spawnFixtureServer(encoding: Encoding, port: number): ChildProcess {
  return spawn("bun", ["run", fixtureServerScript], {
    cwd: e2eRoot,
    env: {
      ...process.env,
      BARESYNC_FIXTURE_BACKEND_PORT: String(port),
      BARESYNC_FIXTURE_DB_PATH: ":memory:",
      BARESYNC_FIXTURE_ENCODING: encoding,
      BARESYNC_FIXTURE_SCOPE_ID: scopeId,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForReady(
  baseUrl: string,
  child: ChildProcess
): Promise<void> {
  let stderr = "";
  if (child.stderr) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `fixture server exited early with code ${child.exitCode}: ${stderr.trim()}`
      );
    }

    try {
      const response = await fetch(`${baseUrl}/__state`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await sleep(100);
  }

  throw new Error(`fixture server did not become ready: ${stderr.trim()}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    await sleep(50);
  }

  child.kill("SIGKILL");
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function readSyncResponse<T>(
  response: Response,
  encoding: Encoding,
  kind: "push" | "pull" | "status"
): Promise<T> {
  if (encoding === "json") {
    return await readJson<T>(response);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeProtobufBody({
    bytes,
    kind,
    message: "response",
    schema: protobufSchema,
  }) as T;
}

async function postSync(
  baseUrl: string,
  encoding: Encoding,
  kind: "push" | "pull" | "status",
  body: Record<string, unknown>
): Promise<Response> {
  const headers =
    encoding === "json"
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/x-protobuf" };
  assertEqual(
    headers["Content-Type"],
    encoding === "json" ? "application/json" : "application/x-protobuf",
    "sync request content-type should match transport"
  );

  return encoding === "json"
    ? await fetch(`${baseUrl}/sync/${kind}`, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      })
    : await fetch(`${baseUrl}/sync/${kind}`, {
        body: toArrayBuffer(
          encodeProtobufBody({
            body,
            kind,
            message: "request",
            schema: protobufSchema,
          })
        ),
        headers,
        method: "POST",
      });
}

async function postRawSync(
  baseUrl: string,
  encoding: Encoding,
  kind: "push" | "pull" | "status",
  body: string | Uint8Array
): Promise<Response> {
  const headers =
    encoding === "json"
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/x-protobuf" };

  return await fetch(`${baseUrl}/sync/${kind}`, {
    body: typeof body === "string" ? body : toArrayBuffer(body),
    headers,
    method: "POST",
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function createPushBody() {
  return {
    clientId: "client-1",
    idempotencyKey: "idem-1",
    scopeId,
    tables: [
      {
        changedRows: [
          {
            createdAt: serverTime,
            deletedAt: null,
            id: "cat-2",
            isSynced: true,
            merchantId: scopeId,
            name: "Tea",
            sortOrder: 2,
            updatedAt: serverTime,
          },
        ],
        deletedIds: ["cat-deleted-1"],
        table: "categories",
      },
      {
        changedRows: [
          {
            categoryId: "cat-2",
            createdAt: serverTime,
            deletedAt: null,
            id: "prod-2",
            isSynced: true,
            merchantId: scopeId,
            name: "Green Tea",
            priceMinorUnits: 12_000,
            updatedAt: serverTime,
          },
        ],
        deletedIds: ["prod-deleted-1"],
        table: "products",
      },
    ],
  };
}

function assertInitialState(state: FixtureState) {
  assertEqual(state.scopeId, scopeId, "scope id should be stable");
  assertEqual(state.categories.length, 1, "expected one seeded category");
  assertEqual(state.products.length, 1, "expected one seeded product");
  assertEqual(
    state.pushed.categories.length,
    0,
    "push buffer should start empty"
  );
  assertEqual(
    state.pushed.products.length,
    0,
    "push buffer should start empty"
  );
  assertEqual(state.categories[0].id, "cat-1", "seeded category should match");
  assertEqual(state.products[0].id, "prod-1", "seeded product should match");
}

async function fetchState(baseUrl: string): Promise<FixtureState> {
  const response = await fetch(`${baseUrl}/__state`);
  assertEqual(response.status, 200, "__state should succeed");
  return await readJson<FixtureState>(response);
}

async function fetchReset(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/__reset`, { method: "POST" });
  assertEqual(response.status, 200, "__reset should succeed");
}

async function runFixtureServerContract(encoding: Encoding): Promise<void> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawnFixtureServer(encoding, port);

  try {
    await waitForReady(baseUrl, child);

    await fetchReset(baseUrl);
    const initialState = await fetchState(baseUrl);
    assertInitialState(initialState);

    const invalidStatus = await postSync(baseUrl, encoding, "status", {
      cursor: "sync:0:categories:cat-0",
      scopeId: "other-scope",
    });
    assertEqual(invalidStatus.status, 404, "invalid scope should be rejected");

    const statusResponse = await postSync(baseUrl, encoding, "status", {
      cursor: "sync:0:categories:cat-0",
      scopeId,
    });
    assertEqual(statusResponse.status, 200, "status should succeed");
    assertEqual(
      statusResponse.headers
        .get("content-type")
        ?.startsWith(
          encoding === "json" ? "application/json" : "application/x-protobuf"
        ),
      true,
      "status response content-type should match transport"
    );
    const status = await readSyncResponse<SyncStatusResponse>(
      statusResponse,
      encoding,
      "status"
    );
    assertEqual(status.hasChanges, true, "status should report changes");
    assertEqual(
      status.serverTime,
      serverTime,
      "status server time should be stable"
    );

    const pullResponse = await postSync(baseUrl, encoding, "pull", {
      cursor: "sync:0:categories:cat-0",
      limit: 100,
      scopeId,
      tables: ["categories", "products"],
    });
    assertEqual(pullResponse.status, 200, "pull should succeed");
    assertEqual(
      pullResponse.headers
        .get("content-type")
        ?.startsWith(
          encoding === "json" ? "application/json" : "application/x-protobuf"
        ),
      true,
      "pull response content-type should match transport"
    );
    const pull = await readSyncResponse<SyncPullResponse>(
      pullResponse,
      encoding,
      "pull"
    );
    assertEqual(pull.hasMore, false, "pull should not paginate");
    assertEqual(pull.tables.length, 2, "pull should return two tables");
    assertEqual(
      pull.tables[0].changedRows[0].id,
      "cat-1",
      "pull should include seeded category"
    );
    assertEqual(
      pull.tables[1].changedRows[0].id,
      "prod-1",
      "pull should include seeded product"
    );

    const invalidPull = await postSync(baseUrl, encoding, "pull", {
      cursor: "sync:0:categories:cat-0",
      limit: 100,
      scopeId: "other-scope",
      tables: ["categories", "products"],
    });
    assertEqual(
      invalidPull.status,
      404,
      "invalid pull scope should be rejected"
    );

    if (encoding === "json") {
      const getPullResponse = await fetch(
        `${baseUrl}/sync/pull?scopeId=${encodeURIComponent(scopeId)}`
      );
      assertEqual(getPullResponse.status, 200, "GET pull should succeed");
      const getPull = await readSyncResponse<SyncPullResponse>(
        getPullResponse,
        encoding,
        "pull"
      );
      assertEqual(
        getPull.tables.length,
        pull.tables.length,
        "GET pull should match POST pull"
      );
    }

    const stateBeforeInvalidPush = await fetchState(baseUrl);
    const invalidPush = await postSync(baseUrl, encoding, "push", {
      clientId: "client-1",
      idempotencyKey: "idem-invalid",
      scopeId: "other-scope",
      tables: [],
    });
    assertEqual(
      invalidPush.status,
      404,
      "invalid push scope should be rejected"
    );
    const stateAfterInvalidPush = await fetchState(baseUrl);
    assertEqual(
      stateAfterInvalidPush,
      stateBeforeInvalidPush,
      "invalid push should not mutate backend state"
    );

    const invalidBody =
      encoding === "json" ? "{not-json" : new Uint8Array([255, 0, 127]);
    const invalidBodyResponse = await postRawSync(
      baseUrl,
      encoding,
      "status",
      invalidBody
    );
    assertEqual(
      invalidBodyResponse.status,
      400,
      "invalid request body should be rejected"
    );
    const invalidBodyJson = (await invalidBodyResponse.json()) as {
      encoding: Encoding;
      error: string;
      kind: "status";
      message: string;
    };
    assertEqual(
      invalidBodyJson.error,
      "invalid_request_body",
      "invalid body response should identify the decode failure"
    );
    assertEqual(
      invalidBodyJson.encoding,
      encoding,
      "invalid body response should report the transport mode"
    );

    const pushResponse = await postSync(
      baseUrl,
      encoding,
      "push",
      createPushBody()
    );
    assertEqual(pushResponse.status, 200, "push should succeed");
    assertEqual(
      pushResponse.headers
        .get("content-type")
        ?.startsWith(
          encoding === "json" ? "application/json" : "application/x-protobuf"
        ),
      true,
      "push response content-type should match transport"
    );
    const push = await readSyncResponse<SyncPushResponse>(
      pushResponse,
      encoding,
      "push"
    );
    assertEqual(
      push.serverTime,
      serverTime,
      "push server time should be stable"
    );
    assertEqual(push.tables.length, 2, "push should acknowledge both tables");
    assertEqual(
      push.tables[0].acceptedCreatedIds,
      ["cat-2"],
      "push should acknowledge category row"
    );
    assertEqual(
      push.tables[1].acceptedCreatedIds,
      ["prod-2"],
      "push should acknowledge product row"
    );
    assertEqual(
      push.tables[0].acceptedDeletedIds,
      ["cat-deleted-1"],
      "push should acknowledge category delete id"
    );
    assertEqual(
      push.tables[1].acceptedDeletedIds,
      ["prod-deleted-1"],
      "push should acknowledge product delete id"
    );

    const pushedState = await fetchState(baseUrl);
    assertEqual(
      pushedState.pushed.categories.length,
      1,
      "pushed category should be recorded"
    );
    assertEqual(
      pushedState.pushed.products.length,
      1,
      "pushed product should be recorded"
    );
    assertEqual(
      pushedState.pushed.categories[0].id,
      "cat-2",
      "category push should persist"
    );
    assertEqual(
      pushedState.pushed.products[0].id,
      "prod-2",
      "product push should persist"
    );

    await fetchReset(baseUrl);
    const resetState = await fetchState(baseUrl);
    assertInitialState(resetState);
  } finally {
    await stopServer(child);
  }
}

for (const encoding of ["json", "protobuf"] as const) {
  describe(`fixture backend contract (${encoding})`, () => {
    it("serves reset/state/status/pull/push over HTTP", async () => {
      await runFixtureServerContract(encoding);
    });
  });
}
