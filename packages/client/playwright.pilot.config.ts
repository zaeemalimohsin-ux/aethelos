import { defineConfig, devices } from "@playwright/test";

/** Pilot build E2E — federation off, matching production pilot gate. */
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
      name: "pilot-off",
      testMatch: /(admission-edge|ux-philosophy)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: 'npx concurrently "vite" "pnpm --filter @aethelos/relay dev"',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_E2E: "1",
    },
  },
});
