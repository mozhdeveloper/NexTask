import { defineConfig } from "vitest/config";
import path from "path";

// Separate config for integration tests that hit the real Supabase.
// - Uses the 'node' environment so that the real global fetch is available.
// - Does NOT load the happy-dom setup file (which stubs fetch).
// Run: npx vitest run --config vitest.integration.config.ts

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [], // no fetch stub — real HTTP needed
    include: ["src/test/integration/**/*.test.ts"],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
