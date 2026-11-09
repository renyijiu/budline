import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs, so the build works from any path (e.g. GitHub Pages at /budline/).
  base: "./",
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
