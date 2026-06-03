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
import {
  fail,
  pickUsableDevice,
  resolveFixtureApiUrl,
  runSync,
  runtime,
} from "./android-utils";
import { buildAndroidBuildArgs } from "./build-fixture";
import {
  buildScreenTimeoutCommand,
  buildStayAwakeCommand,
} from "./device-power";
import {
  buildInstallApkCommand,
  buildUninstallAppCommand,
} from "./package-install";
import {
  buildAndroidKeystoreProperties,
  buildReleaseKeystoreCommand,
  ensureAndroidReleaseSigning,
} from "./release-signing";

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

const fixtureAppId =
  runtime.process.env.BARESYNC_ANDROID_APP_ID ?? "com.baresync.fixture";

const cargoFeatures = runtime.process.env.BARESYNC_FIXTURE_CARGO_FEATURES;

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
  fail(`Unsupported Android ABI: ${abi}`, "android:install-fixture");
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
    fail(
      `No APK was produced under ${apkOutputDir}`,
      "android:install-fixture"
    );
  }

  return apks.sort(
    (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
  )[0];
}

function ensureReleaseSigning() {
  if (!existsSync(androidBuildGradlePath)) {
    fail(
      `Android Gradle file was not generated at ${androidBuildGradlePath}`,
      "android:install-fixture"
    );
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
    fail(
      "Failed to generate Android fixture release keystore.",
      "android:install-fixture"
    );
  }
}

const devices = runSync(["adb", "devices", "-l"]);
if (devices.code !== 0) {
  fail(
    `adb devices failed:\n${devices.stderr || devices.stdout}`,
    "android:install-fixture"
  );
}

const device = pickUsableDevice(devices.stdout);
if (!device) {
  fail("No usable adb target found.", "android:install-fixture");
}

const keepAwake = runSync(buildStayAwakeCommand(device.serial, true), {
  inherit: true,
});
if (keepAwake.code !== 0) {
  fail(
    "Failed to keep Android device awake before fixture install.",
    "android:install-fixture"
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
    "Failed to extend Android screen timeout before fixture install.",
    "android:install-fixture"
  );
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
  fail(
    `Failed to read Android ABI from ${device.serial}`,
    "android:install-fixture"
  );
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
    fail("Tauri Android project generation failed.", "android:install-fixture");
  }
}

ensureReleaseSigning();

const build = runSync(buildAndroidBuildArgs(tauriTarget, cargoFeatures), {
  cwd: fixtureDir,
  env: buildEnv,
  inherit: true,
});
if (build.code !== 0) {
  fail("Tauri Android APK build failed.", "android:install-fixture");
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
  fail("adb install failed.", "android:install-fixture");
}

console.log("[android:install-fixture] install complete");
