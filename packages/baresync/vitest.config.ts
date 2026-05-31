import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.direnv/**",
      "**/nix/store/**",
      "**/server/__test__/simulation.test.ts",
      "**/server/__test__/drizzle.test.ts",
      "**/server/__test__/server.test.ts",
      "**/server/__test__/handlers.test.ts",
      "**/db/__test__/drizzle-proxy.test.ts",
    ],
  },
});
