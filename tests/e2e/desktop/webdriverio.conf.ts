import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FIXTURE_TRANSPORT_MODE,
  FIXTURE_TRANSPORT_ENV,
} from "../fixture-transport";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const runtime = globalThis as typeof globalThis & {
  process: {
    env: Record<string, string | undefined>;
    exit(code?: number): void;
    on(
      event: "exit" | "SIGINT" | "SIGTERM" | "SIGHUP" | "SIGBREAK",
      listener: () => void
    ): void;
    stderr: NodeJS.WriteStream;
    stdout: NodeJS.WriteStream;
  };
};

let tauriDriver: ReturnType<typeof spawn> | undefined;
let fixtureBackend: ReturnType<typeof spawn> | undefined;
let fixtureDevServer: ReturnType<typeof spawn> | undefined;
let exiting = false;

function closeTauriDriver() {
  exiting = true;
  tauriDriver?.kill();
  fixtureBackend?.kill();
  fixtureDevServer?.kill();
}

function onShutdown(fn: () => void) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      runtime.process.exit();
    }
  };

  runtime.process.on("exit", cleanup);
  runtime.process.on("SIGINT", cleanup);
  runtime.process.on("SIGTERM", cleanup);
  runtime.process.on("SIGHUP", cleanup);
  runtime.process.on("SIGBREAK", cleanup);
}

function findAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("failed to allocate fixture backend port"));
      });
    });
  });
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
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`fixture backend did not start at ${apiUrl}`);
}

onShutdown(() => {
  closeTauriDriver();
});

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./sync-smoke.test.ts"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application:
          runtime.process.env.BARESYNC_DESKTOP_APP_PATH ??
          path.resolve(__dirname, "../../../target/debug/baresync-fixture"),
      },
    },
  ],
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 60_000,
  },
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  baseUrl: "http://127.0.0.1:1420",
  onPrepare: async () => {
    const backendPort =
      runtime.process.env.BARESYNC_FIXTURE_BACKEND_PORT ??
      String(await findAvailablePort());
    const fixtureEncoding =
      runtime.process.env[FIXTURE_TRANSPORT_ENV] ??
      DEFAULT_FIXTURE_TRANSPORT_MODE;
    const fixtureApiUrl =
      runtime.process.env.BARESYNC_FIXTURE_API_URL ??
      `http://127.0.0.1:${backendPort}`;
    runtime.process.env.BARESYNC_FIXTURE_BACKEND_PORT = backendPort;
    runtime.process.env.BARESYNC_FIXTURE_API_URL = fixtureApiUrl;
    runtime.process.env[FIXTURE_TRANSPORT_ENV] = fixtureEncoding;
    runtime.process.env.BARESYNC_FIXTURE_RUN_ID ??= `desktop-${Date.now()}`;
    runtime.process.env.BARESYNC_FIXTURE_DB_PATH ??= path.resolve(
      "/tmp",
      `baresync-fixture-${runtime.process.env.BARESYNC_FIXTURE_RUN_ID}.db`
    );

    fixtureBackend = spawn("bun", ["run", "backend/fixture-server.ts"], {
      cwd: path.resolve(__dirname, "../"),
      env: {
        ...runtime.process.env,
        BARESYNC_FIXTURE_BACKEND_PORT: backendPort,
        BARESYNC_FIXTURE_DB_PATH: runtime.process.env.BARESYNC_FIXTURE_DB_PATH,
        [FIXTURE_TRANSPORT_ENV]: fixtureEncoding,
      },
      shell: true,
      stdio: ["ignore", runtime.process.stdout, runtime.process.stderr],
    });
    fixtureBackend.on("error", (error) => {
      console.error("fixture backend error:", error);
      runtime.process.exit(1);
    });
    await waitForFixtureBackend(fixtureApiUrl);

    fixtureDevServer = spawn(
      "bun",
      ["run", "dev", "--host", "127.0.0.1", "--port", "5173"],
      {
        cwd: path.resolve(__dirname, "../../../tests/fixture-app"),
        shell: true,
        stdio: ["ignore", runtime.process.stdout, runtime.process.stderr],
      }
    );
    fixtureDevServer.on("error", (error) => {
      console.error("fixture dev server error:", error);
      runtime.process.exit(1);
    });

    spawnSync(
      "cargo",
      [
        "build",
        "-p",
        "baresync-fixture",
        "--manifest-path",
        path.resolve(
          __dirname,
          "../../../tests/fixture-app/src-tauri/Cargo.toml"
        ),
      ],
      {
        cwd: path.resolve(__dirname, "../../../"),
        env: {
          ...runtime.process.env,
          [FIXTURE_TRANSPORT_ENV]: fixtureEncoding,
        },
        shell: true,
        stdio: "inherit",
      }
    );
  },
  beforeSession: () => {
    tauriDriver = spawn(
      path.resolve(os.homedir(), ".cargo", "bin", "tauri-driver"),
      [],
      { stdio: ["ignore", runtime.process.stdout, runtime.process.stderr] }
    );

    tauriDriver.on("error", (error) => {
      console.error("tauri-driver error:", error);
      runtime.process.exit(1);
    });

    tauriDriver.on("exit", (code) => {
      if (!exiting) {
        console.error("tauri-driver exited with code:", code);
        runtime.process.exit(1);
      }
    });
  },
  afterSession: () => {
    closeTauriDriver();
  },
};
