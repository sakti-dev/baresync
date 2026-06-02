import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/schema/index.ts",
    "src/generator/index.ts",
    "src/db/index.ts",
    "src/server/index.ts",
    "src/server/drizzle.ts",
    "src/tauri/index.ts",
    "src/limits.ts",
    "src/cli/index.ts",
  ],
  format: ["esm"],
  target: "node18",
  dts: {
    resolve: true,
  },
  splitting: true,
  clean: true,
  sourcemap: true,
});
