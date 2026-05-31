import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  DEFAULT_FIXTURE_TRANSPORT_MODE,
  FIXTURE_TRANSPORT_ENV,
} from "../fixture-transport";
import {
  buildAnimationScaleCommand,
  buildScreenTimeoutCommand,
  buildStayAwakeCommand,
} from "./device-power";
import { inferLanHostAddressFromIpAddr } from "./host-address";

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

function runSync(args: string[], options: { inherit?: boolean } = {}) {
  const result = bunRuntime.Bun.spawnSync(args, {
    stderr: options.inherit ? "inherit" : "pipe",
    stdout: options.inherit ? "inherit" : "pipe",
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

function inferHostAddress() {
  const addresses = runSync(["ip", "-4", "addr", "show", "scope", "global"]);
  if (addresses.code !== 0) {
    return null;
  }

  return inferLanHostAddressFromIpAddr(addresses.stdout);
}

const fixtureAppId =
  runtime.process.env.BARESYNC_ANDROID_APP_ID ?? "com.baresync.fixture";

const readyText =
  runtime.process.env.BARESYNC_ANDROID_READY_TEXT ?? "Baresync Fixture";
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

const keepAwake = runSync(buildStayAwakeCommand(device.serial, true), {
  inherit: true,
});
if (keepAwake.code !== 0) {
  fail("Failed to keep Android device awake before smoke run.");
}

const extendScreenTimeout = runSync(
  buildScreenTimeoutCommand(device.serial, 3_600_000),
  {
    inherit: true,
  }
);
if (extendScreenTimeout.code !== 0) {
  fail("Failed to extend Android screen timeout before smoke run.");
}

const disableAnimations = runSync(
  buildAnimationScaleCommand(device.serial, 0),
  {
    inherit: true,
  }
);
if (disableAnimations.code !== 0) {
  fail("Failed to disable Android animations before smoke run.");
}

let fixtureBackendUrl = runtime.process.env.BARESYNC_FIXTURE_API_URL;
if (!fixtureBackendUrl) {
  if (device.isEmulator) {
    fixtureBackendUrl = "http://10.0.2.2:18080";
  } else {
    const hostAddress = inferHostAddress();
    if (!hostAddress) {
      fail(
        "BARESYNC_FIXTURE_API_URL is required for this device because the host address could not be inferred."
      );
    }
    fixtureBackendUrl = `http://${hostAddress}:18080`;
  }
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

async function waitForBackendPush(apiUrl: string, expectedIds: string[]) {
  const deadline = Date.now() + 30_000;
  let lastState: string | null = null;

  while (Date.now() < deadline) {
    const response = await fetch(`${apiUrl}/__state`);
    if (!response.ok) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      continue;
    }

    const backendState = (await response.json()) as {
      pushed: {
        categories: Array<{ id: string }>;
        products: Array<{ id: string }>;
      };
    };

    const pushedState = JSON.stringify(backendState.pushed);
    lastState = pushedState;

    if (expectedIds.every((id) => pushedState.includes(id))) {
      return backendState;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  fail(
    [
      "Fixture backend did not record the expected pushed rows before timeout.",
      lastState ? `Last pushed state: ${lastState}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" ")
  );
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
const restoreAnimations = runSync(
  buildAnimationScaleCommand(device.serial, 1),
  {
    inherit: true,
  }
);
if (restoreAnimations.code !== 0) {
  console.warn(
    `[android:sync] failed to restore Android animation scale for ${device.serial}`
  );
}
const restoreAwake = runSync(buildStayAwakeCommand(device.serial, false), {
  inherit: true,
});
if (restoreAwake.code !== 0) {
  console.warn(
    `[android:sync] failed to restore Android sleep setting for ${device.serial}`
  );
}
if (exitCode !== 0) {
  runtime.process.exit(exitCode);
}

await waitForBackendPush(fixtureBackendUrl, [
  "local-cat-001",
  "local-prod-001",
]);

runtime.process.exit(exitCode);
