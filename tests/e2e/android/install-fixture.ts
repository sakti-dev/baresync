import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEVICE_STATE_SPLIT_RE = /\s+/;
const IPV4_HOST_RE = /^(\d{1,3}(?:\.\d{1,3}){3})/;
const ROUTE_SRC_RE = /\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, "..");
const repoRoot = resolve(packageDir, "..", "..");
const fixtureDir = resolve(repoRoot, "tests/fixture-app");
const androidProjectDir = resolve(fixtureDir, "src-tauri/gen/android");
const apkOutputDir = resolve(androidProjectDir, "app/build/outputs/apk");

const runtime = globalThis as typeof globalThis & {
  process: {
    env: Record<string, string | undefined>;
    exit(code?: number): void;
  };
};

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
  runtime.process.exit(1);
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

function inferHostAddress(serial: string) {
  const match = IPV4_HOST_RE.exec(serial);
  if (!match) {
    return null;
  }

  const route = runSync(["ip", "route", "get", match[1]]);
  if (route.code !== 0) {
    return null;
  }

  return ROUTE_SRC_RE.exec(route.stdout)?.[1] ?? null;
}

function resolveFixtureApiUrl(device: DeviceTarget) {
  if (runtime.process.env.BARESYNC_FIXTURE_API_URL) {
    return runtime.process.env.BARESYNC_FIXTURE_API_URL;
  }

  if (device.isEmulator) {
    return "http://10.0.2.2:18080";
  }

  const hostAddress = inferHostAddress(device.serial);
  if (hostAddress) {
    return `http://${hostAddress}:18080`;
  }

  fail(
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

const devices = runSync(["adb", "devices", "-l"]);
if (devices.code !== 0) {
  fail(`adb devices failed:\n${devices.stderr || devices.stdout}`);
}

const device = pickUsableDevice(devices.stdout);
if (!device) {
  fail("No usable adb target found.");
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
const buildEnv = {
  ...runtime.process.env,
  BARESYNC_FIXTURE_API_URL: fixtureApiUrl,
};

console.log(`[android:install-fixture] target=${device.serial}`);
console.log(`[android:install-fixture] abi=${abi.stdout}`);
console.log(`[android:install-fixture] tauriTarget=${tauriTarget}`);
console.log(`[android:install-fixture] fixtureApiUrl=${fixtureApiUrl}`);

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

const build = runSync(
  [
    "bun",
    "x",
    "@tauri-apps/cli",
    "android",
    "build",
    "--debug",
    "--apk",
    "--target",
    tauriTarget,
    "--ci",
  ],
  {
    cwd: fixtureDir,
    env: buildEnv,
    inherit: true,
  }
);
if (build.code !== 0) {
  fail("Tauri Android APK build failed.");
}

const apk = findLatestApk();
console.log(`[android:install-fixture] apk=${apk}`);

const install = runSync(["adb", "-s", device.serial, "install", "-r", apk], {
  inherit: true,
});
if (install.code !== 0) {
  fail("adb install failed.");
}

console.log("[android:install-fixture] install complete");
