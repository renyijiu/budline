import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@dimforge/rapier2d-deterministic"],
  },
  build: {
    target: "es2024",
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
});
