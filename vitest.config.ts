import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@dimforge/rapier2d-deterministic/rapier.js": "@dimforge/rapier2d-deterministic-compat",
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
