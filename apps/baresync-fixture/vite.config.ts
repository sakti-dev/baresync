import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@tauri-apps/api/core"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: ["@tauri-apps/api/core"],
    },
  },
});
