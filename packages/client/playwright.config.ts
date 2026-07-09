import { defineConfig, devices } from "@playwright/test";

const dockerStack = process.env.AETHELOS_DOCKER === "1";
const shareUrlProof = Boolean(process.env.AETHELOS_SHARE_URL?.trim());
const shareUrlSpecs = /(?:founder|joiner)-share-url\.spec\.ts$/;
const dockerFounderSpec = /founder-mobile\.spec\.ts$/;

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
      name: "chromium",
      testIgnore: [dockerFounderSpec, shareUrlSpecs],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "founder-docker",
      testMatch: dockerFounderSpec,
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://localhost:8080",
      },
    },
    {
      name: "share-url-mobile",
      testMatch: shareUrlSpecs,
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: dockerStack || shareUrlProof
    ? undefined
    : {
        command: 'npx concurrently "vite" "pnpm --filter @aethelos/relay dev"',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        env: {
          VITE_E2E: "1",
        },
      },
});
