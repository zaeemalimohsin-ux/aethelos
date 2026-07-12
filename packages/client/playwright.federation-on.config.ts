import { defineConfig, devices } from "@playwright/test";

/** Vite dev, federation on — onboarding copy matches production builds. */
export default defineConfig({
  timeout: 120000,
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "federation-on",
      testMatch:
        /(admission-edge|ux-philosophy|onboarding|edge-cases-onboarding|federation|federation-cap)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node ../../scripts/start-e2e-stack.mjs",
    port: 5173,
    reuseExistingServer: !process.env.CI && !process.env.AETHELOS_FRESH_E2E,
    env: {
      VITE_E2E: "1",
      VITE_ENABLE_FEDERATION: "1",
    },
  },
});
