import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __PROOF_E2E__: JSON.stringify(process.env.VITE_E2E ?? ""),
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
