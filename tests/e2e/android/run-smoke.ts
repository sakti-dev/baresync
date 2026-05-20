import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  DEFAULT_FIXTURE_TRANSPORT_MODE,
  FIXTURE_TRANSPORT_ENV,
} from "../fixture-transport";

const DEVICE_STATE_SPLIT_RE = /\s+/;
const APP_ID_PLACEHOLDER = ["$", "{BARESYNC_ANDROID_APP_ID}"].join("");
const TRANSPORT_PLACEHOLDER = ["$", "{BARESYNC_FIXTURE_ENCODING}"].join("");

const runtime = globalThis as typeof globalThis & {
  process: {
    env: Record<string, string | undefined>;
    cwd(): string;
    exit(code?: number): void;
    stderr: NodeJS.WriteStream;
    stdout: NodeJS.WriteStream;
  };
};

const bunRuntime = globalThis as typeof globalThis & {
  Bun: {
    spawn(
      args: string[],
      options: {
        cwd?: string;
        env?: Record<string, string | undefined>;
        stderr?: "inherit" | "pipe";
        stdin?: "inherit" | "ignore" | "pipe";
        stdout?: "inherit" | "pipe";
      }
    ): { exited: Promise<number> };
    spawnSync(
      args: string[],
      options: {
        stderr?: "inherit" | "pipe";
        stdin?: "inherit" | "ignore" | "pipe";
        stdout?: "inherit" | "pipe";
      }
    ): {
      exitCode: number;
      stderr: Uint8Array;
      stdout: Uint8Array;
    };
  };
};

function runSync(args: string[]) {
  const result = bunRuntime.Bun.spawnSync(args, {
    stderr: "pipe",
    stdout: "pipe",
    stdin: "ignore",
  });

  return {
    code: result.exitCode,
    stderr: new TextDecoder().decode(result.stderr),
    stdout: new TextDecoder().decode(result.stdout),
  };
}

function pickUsableDevice(devicesOutput: string) {
  const lines = devicesOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const deviceLine = lines.find(
    (line) =>
      !line.startsWith("List of devices attached") &&
      line.split(DEVICE_STATE_SPLIT_RE).includes("device")
  );

  if (!deviceLine) {
    return null;
  }

  const serial = deviceLine.split(DEVICE_STATE_SPLIT_RE)[0];
  const isEmulator = serial.startsWith("emulator-");

  return {
    isEmulator,
    serial,
  };
}

function fail(message: string): never {
  console.error(`[android:sync] ${message}`);
  throw new Error(message);
}

const fixtureAppId =
  runtime.process.env.BARESYNC_ANDROID_APP_ID ?? "com.baresync.fixture";

const readyText =
  runtime.process.env.BARESYNC_ANDROID_READY_TEXT ?? "Baresync Fixture";
const fixtureBackendUrl =
  runtime.process.env.BARESYNC_FIXTURE_API_URL ?? "http://127.0.0.1:18080";
const fixtureEncoding =
  runtime.process.env[FIXTURE_TRANSPORT_ENV] ?? DEFAULT_FIXTURE_TRANSPORT_MODE;
runtime.process.env[FIXTURE_TRANSPORT_ENV] = fixtureEncoding;
const maestroConfig = resolve("android/sync-smoke.yaml");
if (!existsSync(maestroConfig)) {
  fail(`Missing Maestro config: ${maestroConfig}`);
}
const resolvedMaestroConfig = resolve(
  tmpdir(),
  `baresync-fixture-android-${Date.now()}.yaml`
);

const devices = runSync(["adb", "devices", "-l"]);
if (devices.code !== 0) {
  fail(`adb devices failed:\n${devices.stderr || devices.stdout}`);
}

const device = pickUsableDevice(devices.stdout);
if (!device) {
  fail(
    "No usable adb device found. Connect an emulator or device, then rerun after `adb devices` shows at least one entry in the `device` state."
  );
}

async function waitForFixtureBackend(apiUrl: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/__state`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep retrying until the timeout expires.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  fail(`Fixture backend did not become ready at ${apiUrl}`);
}

await waitForFixtureBackend(fixtureBackendUrl);
await fetch(`${fixtureBackendUrl}/__reset`, { method: "POST" });

const installed = runSync([
  "adb",
  "-s",
  device.serial,
  "shell",
  "pm",
  "path",
  fixtureAppId,
]);
if (installed.code !== 0 || installed.stdout.trim().length === 0) {
  fail(
    [
      `Fixture app id ${fixtureAppId} is not installed on ${device.serial}.`,
      "Install the fixture Android build on the connected target before running Maestro.",
    ].join(" ")
  );
}

console.log(
  `[android:sync] target=${device.serial} (${device.isEmulator ? "emulator" : "device"})`
);
console.log(`[android:sync] appId=${fixtureAppId}`);
console.log(`[android:sync] readyText=${readyText}`);
console.log(`[android:sync] backendUrl=${fixtureBackendUrl}`);
console.log(`[android:sync] encoding=${fixtureEncoding}`);

writeFileSync(
  resolvedMaestroConfig,
  readFileSync(maestroConfig, "utf8")
    .replace(APP_ID_PLACEHOLDER, fixtureAppId)
    .replace(TRANSPORT_PLACEHOLDER, fixtureEncoding)
);

const maestro = bunRuntime.Bun.spawn(
  ["maestro", "test", resolvedMaestroConfig],
  {
    cwd: runtime.process.cwd(),
    env: {
      ...runtime.process.env,
      BARESYNC_ANDROID_APP_ID: fixtureAppId,
      BARESYNC_ANDROID_READY_TEXT: readyText,
    },
    stderr: "inherit",
    stdout: "inherit",
    stdin: "inherit",
  }
);

const exitCode = await maestro.exited;
if (exitCode !== 0) {
  runtime.process.exit(exitCode);
}

const backendStateResponse = await fetch(`${fixtureBackendUrl}/__state`);
if (!backendStateResponse.ok) {
  fail(
    `Failed to read fixture backend state from ${fixtureBackendUrl}/__state`
  );
}

const backendState = (await backendStateResponse.json()) as {
  pushed: {
    categories: Array<{ id: string }>;
    products: Array<{ id: string }>;
  };
};

const pushedState = JSON.stringify(backendState.pushed);
if (!pushedState.includes("local-cat-001")) {
  fail("Fixture backend did not record the pushed category local-cat-001");
}

if (!pushedState.includes("local-prod-001")) {
  fail("Fixture backend did not record the pushed product local-prod-001");
}

runtime.process.exit(exitCode);
