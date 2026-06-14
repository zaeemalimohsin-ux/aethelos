#!/usr/bin/env node
/**
 * Automates the UI and records a walkthrough video using Playwright.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages", "client", "package.json"));
const { chromium } = require("playwright");

const PASSWORD = "walkthrough-pass-123";
const VIDEO_OUTPUT_DIR = join(root, "test-results", "videos");
const FINAL_ARTIFACT_DIR = "C:/Users/zaeem/.gemini/antigravity/brain/ddede381-522a-4f9a-a3da-3aadbe9272d3";
const FINAL_VIDEO_PATH = join(FINAL_ARTIFACT_DIR, "aethelos_walkthrough.webm");

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      console.log(`waitForServer: fetch ${url} status ${res.status}`);
      if (res.ok || res.status < 500) return;
    } catch (err) {
      console.log(`waitForServer: fetch ${url} failed: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Server at ${url} did not start in time`);
}

function freePorts() {
  if (process.platform !== "win32") return;
  try {
    spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-Process node,aethelos-desktop -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*App2*' } | Stop-Process -Force -ErrorAction SilentlyContinue; Get-NetTCPConnection -LocalPort 5173,8787 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }",
      ],
      { stdio: "ignore" }
    );
  } catch (err) {
    console.warn("Could not free ports:", err);
  }
}

async function main() {
  console.log("Freeing ports and processes from previous runs...");
  freePorts();
  await new Promise((r) => setTimeout(r, 2000));

  console.log("Starting @aethelos/relay dev server...");
  const relay = spawn("pnpm", ["--filter", "@aethelos/relay", "dev"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, VITE_E2E: "1" }
  });

  console.log("Starting @aethelos/client dev server...");
  const client = spawn("pnpm", ["--filter", "@aethelos/client", "dev"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, VITE_E2E: "1" }
  });

  let browser;
  try {
    console.log("Waiting for Vite dev server on http://127.0.0.1:5173 (timeout: 120s)...");
    await waitForServer("http://127.0.0.1:5173", 120000);
    console.log("Dev server is ready! Launching Playwright browser...");

    if (!existsSync(VIDEO_OUTPUT_DIR)) {
      mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      recordVideo: {
        dir: VIDEO_OUTPUT_DIR,
        size: { width: 1024, height: 768 }
      }
    });

    const page = await context.newPage();
    console.log("Navigating to http://127.0.0.1:5173...");
    await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Onboarding - Welcome
    console.log("Clicking 'Create a new identity'...");
    await page.getByRole("button", { name: "Create a new identity" }).click();
    await page.waitForTimeout(1500);

    // Form inputs
    console.log("Filling display name and passphrase...");
    await page.getByLabel("Display name").fill("Visionary Founder");
    await page.waitForTimeout(1000);
    await page.getByLabel("Passphrase", { exact: true }).fill(PASSWORD);
    await page.waitForTimeout(1000);
    await page.getByLabel("Confirm passphrase").fill(PASSWORD);
    await page.waitForTimeout(1500);

    console.log("Clicking 'Create identity'...");
    await page.getByRole("button", { name: "Create identity" }).click();
    
    console.log("Waiting for recovery phrase...");
    await page.getByText("Save your recovery phrase").waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log("Confirming recovery backup...");
    await page.getByRole("checkbox").check();
    await page.waitForTimeout(1500);

    console.log("Clicking 'Continue'...");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("What would you like to do").waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Create Community
    console.log("Clicking 'Start a new community'...");
    await page.getByRole("button", { name: "Start a new community" }).click();
    await page.waitForTimeout(1500);

    console.log("Filling community name...");
    await page.getByLabel("Community name").fill("AethelOS Genesis");
    await page.waitForTimeout(1500);

    console.log("Creating community...");
    await page.getByRole("button", { name: "Create community" }).click();

    console.log("Waiting for community dashboard to load...");
    await page.getByRole("button", { name: "Community", exact: true }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(3000);

    // Tab Navigation & Visual Inspection
    console.log("Viewing Community tab...");
    await page.waitForTimeout(2000);

    console.log("Clicking Governance tab...");
    await page.getByRole("button", { name: "Governance", exact: true }).click();
    await page.waitForTimeout(2500);

    console.log("Clicking Proposals tab...");
    await page.getByRole("button", { name: "Proposals", exact: true }).click();
    await page.waitForTimeout(2500);

    console.log("Clicking Identity tab...");
    await page.getByRole("button", { name: "Identity", exact: true }).click();
    await page.waitForTimeout(2500);

    console.log("Toggling Light Theme...");
    const themeLight = page.getByRole("button", { name: "Light" });
    if (await themeLight.isVisible()) {
      await themeLight.click();
      await page.waitForTimeout(3000);
    }

    console.log("Toggling Dark Theme back...");
    const themeDark = page.getByRole("button", { name: "Dark" });
    if (await themeDark.isVisible()) {
      await themeDark.click();
      await page.waitForTimeout(3000);
    }

    console.log("Going back to Community tab...");
    await page.getByRole("button", { name: "Community", exact: true }).click();
    await page.waitForTimeout(3000);

    console.log("Closing browser and saving video...");
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();

    if (videoPath && existsSync(videoPath)) {
      if (!existsSync(FINAL_ARTIFACT_DIR)) {
        mkdirSync(FINAL_ARTIFACT_DIR, { recursive: true });
      }
      copyFileSync(videoPath, FINAL_VIDEO_PATH);
      console.log(`\nSUCCESS: Walkthrough video recorded and saved to:\n${FINAL_VIDEO_PATH}`);
    } else {
      console.warn("Playwright did not produce a video file.");
    }

  } catch (err) {
    console.error("Recording error:", err);
  } finally {
    console.log("Cleaning up dev servers...");
    relay.kill("SIGTERM");
    client.kill("SIGTERM");
    freePorts();
  }
}

main().catch(console.error);
