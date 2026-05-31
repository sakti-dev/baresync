import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FIXTURE_TRANSPORT_MODE,
  FIXTURE_TRANSPORT_ENV,
} from "../fixture-transport";
import { buildAndroidBuildArgs } from "./build-fixture";
import {
  buildScreenTimeoutCommand,
  buildStayAwakeCommand,
} from "./device-power";
import { inferLanHostAddressFromIpAddr } from "./host-address";
import {
  buildInstallApkCommand,
  buildUninstallAppCommand,
} from "./package-install";
import {
  buildAndroidKeystoreProperties,
  buildReleaseKeystoreCommand,
  ensureAndroidReleaseSigning,
} from "./release-signing";

const DEVICE_STATE_SPLIT_RE = /\s+/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, "..");
const repoRoot = resolve(packageDir, "..", "..");
const fixtureDir = resolve(repoRoot, "tests/fixture-app");
const androidProjectDir = resolve(fixtureDir, "src-tauri/gen/android");
const androidBuildGradlePath = resolve(
  androidProjectDir,
  "app/build.gradle.kts"
);
const androidKeystorePath = resolve(
  androidProjectDir,
  "fixture-release.keystore"
);
const androidKeystorePropertiesPath = resolve(
  androidProjectDir,
  "keystore.properties"
);
const apkOutputDir = resolve(androidProjectDir, "app/build/outputs/apk");
const fixtureKeystoreAlias = "baresync-fixture";
const fixtureKeystorePassword = "baresync-fixture";

const runtime = globalThis as typeof globalThis & {
  process: {
    env: Record<string, string | undefined>;
    exit(code?: number): void;
  };
};

const fixtureAppId =
  runtime.process.env.BARESYNC_ANDROID_APP_ID ?? "com.baresync.fixture";

const cargoFeatures = runtime.process.env.BARESYNC_FIXTURE_CARGO_FEATURES;

const bunRuntime = globalThis as typeof globalThis & {
  Bun: {
    spawnSync(
      args: string[],
      options: {
        cwd?: string;
        env?: Record<string, string | undefined>;
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

interface DeviceTarget {
  isEmulator: boolean;
  serial: string;
}

function decode(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes).trim();
}

function runSync(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    inherit?: boolean;
  } = {}
) {
  const result = bunRuntime.Bun.spawnSync(args, {
    cwd: options.cwd,
    env: options.env,
    stderr: options.inherit ? "inherit" : "pipe",
    stdout: options.inherit ? "inherit" : "pipe",
    stdin: "ignore",
  });

  return {
    code: result.exitCode,
    stderr: decode(result.stderr),
    stdout: decode(result.stdout),
  };
}

function fail(message: string): never {
  console.error(`[android:install-fixture] ${message}`);
  throw new Error(message);
}

function pickUsableDevice(devicesOutput: string): DeviceTarget | null {
  const requestedSerial = runtime.process.env.ANDROID_SERIAL;
  const lines = devicesOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("List of devices attached"));

  const deviceLine = lines.find((line) => {
    const parts = line.split(DEVICE_STATE_SPLIT_RE);
    return (
      parts.includes("device") &&
      (!requestedSerial || parts[0] === requestedSerial)
    );
  });

  if (!deviceLine) {
    return null;
  }

  const serial = deviceLine.split(DEVICE_STATE_SPLIT_RE)[0];
  return {
    isEmulator: serial.startsWith("emulator-"),
    serial,
  };
}

function mapAbiToTauriTarget(abi: string) {
  if (abi === "arm64-v8a") {
    return "aarch64";
  }
  if (abi === "armeabi-v7a") {
    return "armv7";
  }
  if (abi === "x86") {
    return "i686";
  }
  if (abi === "x86_64") {
    return "x86_64";
  }
  fail(`Unsupported Android ABI: ${abi}`);
}

function inferHostAddress() {
  const addresses = runSync(["ip", "-4", "addr", "show", "scope", "global"]);
  if (addresses.code !== 0) {
    return null;
  }

  return inferLanHostAddressFromIpAddr(addresses.stdout);
}

function resolveFixtureApiUrl(device: DeviceTarget): string {
  if (runtime.process.env.BARESYNC_FIXTURE_API_URL) {
    return runtime.process.env.BARESYNC_FIXTURE_API_URL;
  }

  const hostAddress = device.isEmulator ? "10.0.2.2" : inferHostAddress();
  if (hostAddress) {
    return `http://${hostAddress}:3001`;
  }

  return fail(
    "BARESYNC_FIXTURE_API_URL is required for this device because the host address could not be inferred."
  );
}

function collectApks(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return collectApks(path);
    }
    return entry.isFile() && entry.name.endsWith(".apk") ? [path] : [];
  });
}

function findLatestApk() {
  const apks = collectApks(apkOutputDir);
  if (apks.length === 0) {
    fail(`No APK was produced under ${apkOutputDir}`);
  }

  return apks.sort(
    (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
  )[0];
}

function ensureReleaseSigning() {
  if (!existsSync(androidBuildGradlePath)) {
    fail(`Android Gradle file was not generated at ${androidBuildGradlePath}`);
  }

  const buildGradle = readFileSync(androidBuildGradlePath, "utf8");
  const signedBuildGradle = ensureAndroidReleaseSigning(buildGradle);
  if (signedBuildGradle !== buildGradle) {
    writeFileSync(androidBuildGradlePath, signedBuildGradle);
  }

  writeFileSync(
    androidKeystorePropertiesPath,
    buildAndroidKeystoreProperties(
      "../fixture-release.keystore",
      fixtureKeystoreAlias,
      fixtureKeystorePassword
    )
  );

  if (existsSync(androidKeystorePath)) {
    return;
  }

  const keytool = runSync(
    buildReleaseKeystoreCommand(
      androidKeystorePath,
      fixtureKeystoreAlias,
      fixtureKeystorePassword
    ),
    {
      inherit: true,
    }
  );
  if (keytool.code !== 0) {
    fail("Failed to generate Android fixture release keystore.");
  }
}

const devices = runSync(["adb", "devices", "-l"]);
if (devices.code !== 0) {
  fail(`adb devices failed:\n${devices.stderr || devices.stdout}`);
}

const device = pickUsableDevice(devices.stdout);
if (!device) {
  fail("No usable adb target found.");
}

const keepAwake = runSync(buildStayAwakeCommand(device.serial, true), {
  inherit: true,
});
if (keepAwake.code !== 0) {
  fail("Failed to keep Android device awake before fixture install.");
}

const extendScreenTimeout = runSync(
  buildScreenTimeoutCommand(device.serial, 3_600_000),
  {
    inherit: true,
  }
);
if (extendScreenTimeout.code !== 0) {
  fail("Failed to extend Android screen timeout before fixture install.");
}

const abi = runSync([
  "adb",
  "-s",
  device.serial,
  "shell",
  "getprop",
  "ro.product.cpu.abi",
]);
if (abi.code !== 0 || abi.stdout.length === 0) {
  fail(`Failed to read Android ABI from ${device.serial}`);
}

const tauriTarget = mapAbiToTauriTarget(abi.stdout);
const fixtureApiUrl = resolveFixtureApiUrl(device);
const fixtureEncoding =
  runtime.process.env[FIXTURE_TRANSPORT_ENV] ?? DEFAULT_FIXTURE_TRANSPORT_MODE;
runtime.process.env[FIXTURE_TRANSPORT_ENV] = fixtureEncoding;
const buildEnv = {
  ...runtime.process.env,
  BARESYNC_FIXTURE_API_URL: fixtureApiUrl,
  [FIXTURE_TRANSPORT_ENV]: fixtureEncoding,
};

console.log(`[android:install-fixture] target=${device.serial}`);
console.log(`[android:install-fixture] abi=${abi.stdout}`);
console.log(`[android:install-fixture] tauriTarget=${tauriTarget}`);
console.log(`[android:install-fixture] fixtureApiUrl=${fixtureApiUrl}`);
console.log(`[android:install-fixture] encoding=${fixtureEncoding}`);

if (!existsSync(androidProjectDir)) {
  const init = runSync(
    ["bun", "x", "@tauri-apps/cli", "android", "init", "--ci"],
    {
      cwd: fixtureDir,
      env: buildEnv,
      inherit: true,
    }
  );
  if (init.code !== 0) {
    fail("Tauri Android project generation failed.");
  }
}

ensureReleaseSigning();

const build = runSync(buildAndroidBuildArgs(tauriTarget, cargoFeatures), {
  cwd: fixtureDir,
  env: buildEnv,
  inherit: true,
});
if (build.code !== 0) {
  fail("Tauri Android APK build failed.");
}

const apk = findLatestApk();
console.log(`[android:install-fixture] apk=${apk}`);

const uninstall = runSync(
  buildUninstallAppCommand(device.serial, fixtureAppId),
  {
    inherit: true,
  }
);
if (uninstall.code !== 0) {
  console.log(
    `[android:install-fixture] ${fixtureAppId} was not installed before release install.`
  );
}

const install = runSync(buildInstallApkCommand(device.serial, apk), {
  inherit: true,
});
if (install.code !== 0) {
  fail("adb install failed.");
}

console.log("[android:install-fixture] install complete");
