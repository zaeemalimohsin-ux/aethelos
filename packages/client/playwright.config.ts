import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @aethelos/relay dev",
      url: "http://127.0.0.1:8787/healthz",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: "pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { VITE_E2E: "1" },
    },
  ],
});
