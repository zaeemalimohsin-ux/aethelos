import { defineConfig, devices } from "@playwright/test";

const dockerE2e = process.env.AETHELOS_DOCKER === "1";
const shareUrl = process.env.AETHELOS_SHARE_URL?.trim();
const shareUrlE2e = Boolean(shareUrl);

const shareUrlSpecs = "**/{founder-share-url,joiner-share-url}.spec.ts";

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
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/founder-mobile.spec.ts", shareUrlSpecs],
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      grepInvert: /community-scale/,
      testIgnore: ["**/founder-mobile.spec.ts", shareUrlSpecs],
    },
    {
      name: "founder-docker",
      use: {
        ...devices["Pixel 5"],
        baseURL: process.env.AETHELOS_BASE_URL ?? "http://localhost:8080",
      },
      testMatch: "**/founder-mobile.spec.ts",
    },
    {
      name: "share-url-mobile",
      use: {
        ...devices["Pixel 5"],
        baseURL: shareUrl ?? "http://localhost:5173",
      },
      testMatch: shareUrlSpecs,
    },
  ],
  webServer:
    dockerE2e || shareUrlE2e
      ? []
      : [
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
