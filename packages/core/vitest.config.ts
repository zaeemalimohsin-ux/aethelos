import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/reducer/**", "src/economy/**", "src/governance/**"],
      thresholds: {
        lines: 75,
        functions: 65,
        branches: 60,
        statements: 75,
        "src/reducer/**": {
          lines: 80,
          functions: 75,
          branches: 58,
          statements: 80,
        },
        "src/economy/**": {
          lines: 65,
          functions: 50,
          branches: 55,
          statements: 65,
        },
        "src/governance/**": {
          lines: 48,
          functions: 20,
          branches: 60,
          statements: 48,
        },
      },
    },
  },
});
