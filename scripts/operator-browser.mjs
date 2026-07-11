#!/usr/bin/env node
/**
 * Headed browser automation: attach to real Edge via CDP (saved logins work).
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../packages/client/node_modules/playwright",
  ),
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultProfile = join(root, "scripts/.operator-browser-profile");
const screenshotDir = join(root, "scripts/.operator-screenshots");
const CDP_PORT = 9333;

function log(...a) {
  console.log("[operator-browser]", ...a);
}

function edgeExe() {
  const candidates = [
    join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    join(process.env.ProgramFiles || "", "Microsoft/Edge/Application/msedge.exe"),
  ];
  return candidates.find((p) => existsSync(p));
}

function closeEdgeIfNeeded() {
  if (process.platform !== "win32") return;
  try {
    execSync("taskkill /IM msedge.exe /F", { stdio: "ignore" });
    log("closed existing Edge processes");
  } catch {
    /* none */
  }
}

async function snap(page, name) {
  mkdirSync(screenshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(screenshotDir, `${stamp}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log("screenshot", path);
}

async function clickIfVisible(page, locator, label) {
  try {
    if (await locator.isVisible({ timeout: 4000 })) {
      await locator.click();
      log("clicked", label);
      return true;
    }
  } catch {
    /* not visible */
  }
  return false;
}

async function waitForCdp(port, maxMs = 45_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`CDP port ${port} not ready`);
}

async function launchEdgeWithCdp(authUrl, options) {
  const exe = edgeExe();
  if (!exe) throw new Error("Microsoft Edge not found");

  let userDataDir = options.profileDir || defaultProfile;
  const args = [`--remote-debugging-port=${CDP_PORT}`];

  if (process.platform === "win32" && options.useSystemEdgeProfile !== false) {
    const edgeData = join(
      process.env.LOCALAPPDATA || "",
      "Microsoft",
      "Edge",
      "User Data",
    );
    if (existsSync(edgeData)) {
      userDataDir = edgeData;
      args.push("--profile-directory=Default");
      closeEdgeIfNeeded();
    }
  }

  args.push(`--user-data-dir=${userDataDir}`, authUrl);
  log("Launching Edge:", exe);
  log("Profile:", userDataDir);

  const child = spawn(exe, args, { detached: true, stdio: "ignore" });
  child.unref();
  await waitForCdp(CDP_PORT);
}

export async function flyAuthViaBrowser(authUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1_200_000;
  await launchEdgeWithCdp(authUrl, options);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  if (!page.url().includes("fly.io")) {
    await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }

  let lastUrl = "";
  let pollCount = 0;

  try {
    await snap(page, "01-fly-auth");
    await clickIfVisible(
      page,
      page.getByRole("link", { name: /sign in with github/i }),
      "Sign in with GitHub",
    );
    await page.waitForTimeout(2500);
    await snap(page, "02-github");

    await clickIfVisible(
      page,
      page.getByRole("button", { name: /^authorize/i }),
      "Authorize Fly",
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = page.url();
      pollCount += 1;
      if (url !== lastUrl || pollCount % 10 === 0) {
        await snap(page, `poll-${pollCount}`);
        lastUrl = url;
      }

      if (url.includes("fly.io") && !url.includes("sign-in") && !url.includes("/login")) {
        log("Fly OAuth complete:", url);
        break;
      }

      if (
        await page
          .getByText(/success|complete|authenticated/i)
          .isVisible()
          .catch(() => false)
      ) {
        log("Fly success text detected");
        break;
      }

      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^authorize/i }),
        "Authorize (retry)",
      );
      await page.waitForTimeout(3000);
    }

    await snap(page, "99-done");
  } finally {
    await browser.close();
  }
}
