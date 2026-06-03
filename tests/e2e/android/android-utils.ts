import { inferLanHostAddressFromIpAddr } from "./host-address";

const DEVICE_STATE_SPLIT_RE = /\s+/;

export const runtime = globalThis as typeof globalThis & {
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

export interface DeviceTarget {
  isEmulator: boolean;
  serial: string;
}

function decode(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export function runSync(
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

export function fail(message: string, prefix = "android"): never {
  console.error(`[${prefix}] ${message}`);
  throw new Error(message);
}

export function pickUsableDevice(devicesOutput: string): DeviceTarget | null {
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

function inferHostAddress() {
  const addresses = runSync(["ip", "-4", "addr", "show", "scope", "global"]);
  if (addresses.code !== 0) {
    return null;
  }

  return inferLanHostAddressFromIpAddr(addresses.stdout);
}

export function resolveFixtureApiUrl(device: DeviceTarget): string {
  if (runtime.process.env.BARESYNC_FIXTURE_API_URL) {
    return runtime.process.env.BARESYNC_FIXTURE_API_URL;
  }

  if (device.isEmulator) {
    return "http://10.0.2.2:3001";
  }

  const hostAddress = inferHostAddress();
  if (!hostAddress) {
    fail(
      "BARESYNC_FIXTURE_API_URL is required for this device because the host address could not be inferred."
    );
  }

  return `http://${hostAddress}:3001`;
}
