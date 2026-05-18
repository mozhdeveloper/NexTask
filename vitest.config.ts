import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      include: [
        // Utilities and mappers — fully unit-tested
        "src/lib/helpers.ts",
        "src/lib/dates.ts",
        "src/lib/constants.ts",
        "src/lib/supabase/mappers.ts",
        // Services with dedicated unit test files
        "src/services/notification.service.ts",
        "src/services/submission.service.ts",
        "src/services/workSettings.service.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 65,
        branches: 50,
        statements: 60,
      },
      reporter: ["text", "lcov"],
    },
    // Integration tests talk to real Supabase — tag them so unit suite stays fast
    // Run: vitest --project unit   OR   vitest --project integration
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
