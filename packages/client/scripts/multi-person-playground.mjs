#!/usr/bin/env node
/**
 * Manual multi-person testing: starts relay + client if needed, then opens N
 * isolated browser windows (separate identity/storage each).
 *
 * Usage:
 *   pnpm playground
 *   pnpm playground -- 4
 *   AETHELOS_INSTANCES=6 pnpm playground
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CLIENT_DIR, "../..");
const CLIENT_URL = "http://localhost:5173";
const RELAY_HEALTH = "http://127.0.0.1:8787/healthz";

const argCount = process.argv.find((a) => /^\d+$/.test(a));
const COUNT = Math.min(
  12,
  Math.max(2, Number(argCount ?? process.env.AETHELOS_INSTANCES ?? 6)),
);

const LABELS = [
  "Founder",
  "Alex",
  "Blake",
  "Casey",
  "Drew",
  "Emery",
  "Finley",
  "Gray",
  "Harper",
  "Indigo",
  "Jordan",
  "Kelly",
];

async function waitFor(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startDetached(command, cwd) {
  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return child;
}

async function ensurePlaywrightBrowser() {
  let missing = true;
  try {
    missing = !fs.existsSync(chromium.executablePath());
  } catch {
    missing = true;
  }
  if (!missing) return;

  console.log("First run: downloading Chromium for test windows (one-time, ~150 MB)…");
  const result = spawnSync("pnpm exec playwright install chromium", {
    cwd: CLIENT_DIR,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      "Could not install Playwright Chromium. Try manually:\n" +
        "  pnpm --filter @aethelos/client exec playwright install chromium",
    );
  }
}

async function launchBrowser() {
  await ensurePlaywrightBrowser();
  try {
    return await chromium.launch({ headless: false });
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (!msg.includes("Executable doesn't exist")) throw err;
    console.log("Chromium missing — installing now…");
    await ensurePlaywrightBrowser();
    return chromium.launch({ headless: false });
  }
}

async function ensureServers() {
  if (!(await waitFor(RELAY_HEALTH, 2500))) {
    console.log("Starting relay (ws://localhost:8787)…");
    startDetached("pnpm dev:relay", REPO_ROOT);
    if (!(await waitFor(RELAY_HEALTH))) {
      throw new Error("Relay did not start. Run `pnpm dev:relay` manually and retry.");
    }
  } else {
    console.log("Relay already running.");
  }

  if (!(await waitFor(CLIENT_URL, 2500))) {
    console.log("Starting client (http://localhost:5173)…");
    startDetached("pnpm dev:client", REPO_ROOT);
    if (!(await waitFor(CLIENT_URL))) {
      throw new Error("Client did not start. Run `pnpm dev:client` manually and retry.");
    }
  } else {
    console.log("Client already running.");
  }
}

async function main() {
  console.log("");
  console.log("AethelOS — multi-person playground");
  console.log(`Opening ${COUNT} isolated browser windows…`);
  console.log("");

  await ensureServers();

  const browser = await launchBrowser();

  for (let i = 0; i < COUNT; i++) {
    const label = LABELS[i] ?? `Person ${i + 1}`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(CLIENT_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate((l) => {
      document.title = `AethelOS — ${l}`;
    }, label);
    console.log(`  • Window ${i + 1}: ${label}`);
  }

  console.log("");
  console.log("Each window = one person (separate keys & storage).");
  console.log("");
  console.log("Quick manual flow:");
  console.log("  1. In Founder: create identity → start a community");
  console.log("  2. Community → Share invite link → copy link");
  console.log("  3. In another window: paste link in address bar → join");
  console.log("  4. Founder: paste join code → vouch → other window: Accept invite");
  console.log("");
  console.log("Chaos / resilience charters (manual):");
  console.log("  • Relay swap: stop relay, run `pnpm dev:relay`, reload windows — nodes catch up from local log");
  console.log("  • Partition: keep one window offline, transact in another, then refresh offline window");
  console.log("  • Byzantine relay: invalid events are ignored by nodes (see relay + sync tests)");
  console.log("  • Head capture: bridge still requires stake-weighted bridge_transfer proposal");
  console.log("");
  console.log("See docs/TESTING_RELEASE.md for full charter descriptions.");
  console.log("");
  console.log("Press Ctrl+C in this terminal to close all windows.");
  console.log("");

  const shutdown = async () => {
    await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
