import { defineConfig, devices } from "@playwright/test";

const dockerStack = process.env.AETHELOS_DOCKER === "1";
const shareUrlProof = Boolean(process.env.AETHELOS_SHARE_URL?.trim());
const hostedUrl = process.env.AETHELOS_URL?.trim().replace(/\/$/, "");
const shareUrlSpecs = /(?:founder|joiner)-share-url\.spec\.ts$/;
const dockerMobileSpecs = /(?:founder|joiner)-mobile\.spec\.ts$/;
const hostedAdmissionSpecs = /hosted-admission\.spec\.ts$/;
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
      testIgnore: [dockerMobileSpecs, shareUrlSpecs, hostedAdmissionSpecs],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "founder-docker",
      testMatch: dockerMobileSpecs,
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
    {
      name: "hosted",
      testMatch: hostedAdmissionSpecs,
      use: {
        ...devices["Pixel 5"],
        baseURL: hostedUrl || "https://app.aethelos.org",
      },
    },
  ],
  webServer:
    dockerStack || shareUrlProof || hostedUrl
      ? undefined
      : {
          command: "node ../../scripts/start-e2e-stack.mjs",
          port: 5173,
          reuseExistingServer: !process.env.CI && !process.env.AETHELOS_FRESH_E2E,
          env: {
            VITE_E2E: "1",
            VITE_ENABLE_FEDERATION: "1",
          },
        },
});
