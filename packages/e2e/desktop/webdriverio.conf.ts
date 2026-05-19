export const config = {
  specs: ["./sync-smoke.test.ts"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "wry",
      "tauri:options": {
        application: process.env.BARESYNC_DESKTOP_APP_PATH ?? "",
      },
    },
  ],
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
};
