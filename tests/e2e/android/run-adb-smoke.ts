import {
  DEFAULT_FIXTURE_TRANSPORT_MODE,
  FIXTURE_TRANSPORT_ENV,
} from "../fixture-transport";
import {
  buildAdbLaunchCommand,
  buildAdbTapCommand,
  findNodeBoundsByText,
  hasUiText,
} from "./adb-ui";
import {
  fail,
  pickUsableDevice,
  resolveFixtureApiUrl,
  runSync,
  runtime,
} from "./android-utils";
import {
  buildScreenTimeoutCommand,
  buildStayAwakeCommand,
} from "./device-power";

const POLL_INTERVAL_MS = 250;
const UI_DUMP_PATH = "/sdcard/baresync-window.xml";

async function delay(ms: number) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
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
    await delay(100);
  }

  fail(`Fixture backend did not become ready at ${apiUrl}`, "android:adb-sync");
}

async function waitForBackendPush(apiUrl: string, expectedIds: string[]) {
  const deadline = Date.now() + 30_000;
  let lastState: string | null = null;

  while (Date.now() < deadline) {
    const response = await fetch(`${apiUrl}/__state`);
    if (!response.ok) {
      await delay(500);
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
      return;
    }

    await delay(500);
  }

  fail(
    [
      "Fixture backend did not record the expected pushed rows before timeout.",
      lastState ? `Last pushed state: ${lastState}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
    "android:adb-sync"
  );
}

function dumpUi(serial: string): string {
  const dump = runSync([
    "adb",
    "-s",
    serial,
    "shell",
    "uiautomator",
    "dump",
    UI_DUMP_PATH,
  ]);
  if (dump.code !== 0) {
    fail(
      `uiautomator dump failed:\n${dump.stderr || dump.stdout}`,
      "android:adb-sync"
    );
  }

  const readDump = runSync(["adb", "-s", serial, "shell", "cat", UI_DUMP_PATH]);
  if (readDump.code !== 0) {
    fail(
      `failed to read uiautomator dump:\n${readDump.stderr || readDump.stdout}`,
      "android:adb-sync"
    );
  }

  return readDump.stdout;
}

async function waitForUiText(
  serial: string,
  expectedText: string,
  timeoutMs: number
) {
  const deadline = Date.now() + timeoutMs;
  let lastDump = "";

  while (Date.now() < deadline) {
    lastDump = dumpUi(serial);
    if (hasUiText(lastDump, expectedText)) {
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }

  fail(
    [
      `Timed out waiting for Android UI text: ${expectedText}`,
      lastDump ? `Last UI dump: ${lastDump.slice(0, 2000)}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join("\n"),
    "android:adb-sync"
  );
}

async function tapText(serial: string, text: string) {
  const deadline = Date.now() + 10_000;
  let lastDump = "";

  while (Date.now() < deadline) {
    lastDump = dumpUi(serial);
    const bounds = findNodeBoundsByText(lastDump, text);
    if (bounds) {
      const tap = runSync(buildAdbTapCommand(serial, bounds));
      if (tap.code !== 0) {
        fail(
          `adb tap failed for ${text}:\n${tap.stderr || tap.stdout}`,
          "android:adb-sync"
        );
      }
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }

  fail(
    [
      `Timed out waiting for tappable Android UI text: ${text}`,
      lastDump ? `Last UI dump: ${lastDump.slice(0, 2000)}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join("\n"),
    "android:adb-sync"
  );
}

const fixtureAppId =
  runtime.process.env.BARESYNC_ANDROID_APP_ID ?? "com.baresync.fixture";
const readyText =
  runtime.process.env.BARESYNC_ANDROID_READY_TEXT ?? "Baresync Fixture";
const fixtureEncoding =
  runtime.process.env[FIXTURE_TRANSPORT_ENV] ?? DEFAULT_FIXTURE_TRANSPORT_MODE;
runtime.process.env[FIXTURE_TRANSPORT_ENV] = fixtureEncoding;

const devices = runSync(["adb", "devices", "-l"]);
if (devices.code !== 0) {
  fail(
    `adb devices failed:\n${devices.stderr || devices.stdout}`,
    "android:adb-sync"
  );
}

const device = pickUsableDevice(devices.stdout);
if (!device) {
  fail("No usable adb target found.", "android:adb-sync");
}

const fixtureBackendUrl = resolveFixtureApiUrl(device);

console.log(
  `[android:adb-sync] target=${device.serial} (${device.isEmulator ? "emulator" : "device"})`
);
console.log(`[android:adb-sync] appId=${fixtureAppId}`);
console.log(`[android:adb-sync] readyText=${readyText}`);
console.log(`[android:adb-sync] backendUrl=${fixtureBackendUrl}`);
console.log(`[android:adb-sync] encoding=${fixtureEncoding}`);

const keepAwake = runSync(buildStayAwakeCommand(device.serial, true), {
  inherit: true,
});
if (keepAwake.code !== 0) {
  fail(
    "Failed to keep Android device awake before smoke run.",
    "android:adb-sync"
  );
}

const extendScreenTimeout = runSync(
  buildScreenTimeoutCommand(device.serial, 3_600_000),
  {
    inherit: true,
  }
);
if (extendScreenTimeout.code !== 0) {
  fail(
    "Failed to extend Android screen timeout before smoke run.",
    "android:adb-sync"
  );
}

try {
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
      `Fixture app id ${fixtureAppId} is not installed on ${device.serial}.`,
      "android:adb-sync"
    );
  }

  runSync([
    "adb",
    "-s",
    device.serial,
    "shell",
    "am",
    "force-stop",
    fixtureAppId,
  ]);
  const clearApp = runSync([
    "adb",
    "-s",
    device.serial,
    "shell",
    "pm",
    "clear",
    fixtureAppId,
  ]);
  if (clearApp.code !== 0) {
    fail(
      `Failed to clear fixture app data:\n${clearApp.stderr || clearApp.stdout}`,
      "android:adb-sync"
    );
  }

  const launch = runSync(buildAdbLaunchCommand(device.serial, fixtureAppId), {
    inherit: true,
  });
  if (launch.code !== 0) {
    fail("Failed to launch fixture app via adb.", "android:adb-sync");
  }

  await waitForUiText(device.serial, readyText, 30_000);
  await waitForUiText(device.serial, "ready", 30_000);

  await tapText(device.serial, "Baseline sync");
  await waitForUiText(device.serial, "cat:Drinks", 30_000);
  await waitForUiText(device.serial, "prod:Kopi Susu", 30_000);

  await tapText(device.serial, "Create local row");
  await waitForUiText(device.serial, "cat:Fixture Category 001", 30_000);
  await waitForUiText(device.serial, "prod:Fixture Product 001", 30_000);

  await tapText(device.serial, "Manual sync");
  await waitForUiText(device.serial, "cat:local-cat-001:synced", 30_000);
  await waitForUiText(device.serial, "prod:local-prod-001:synced", 30_000);
  await waitForBackendPush(fixtureBackendUrl, [
    "local-cat-001",
    "local-prod-001",
  ]);

  console.log("[android:adb-sync] smoke passed");
} finally {
  const restoreAwake = runSync(buildStayAwakeCommand(device.serial, false), {
    inherit: true,
  });
  if (restoreAwake.code !== 0) {
    console.warn(
      `[android:adb-sync] failed to restore Android sleep setting for ${device.serial}`
    );
  }
}
