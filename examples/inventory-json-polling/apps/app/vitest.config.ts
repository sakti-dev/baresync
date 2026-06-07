import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sync-contract": fileURLToPath(
        new URL("../../packages/sync-contract/src", import.meta.url)
      ),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
