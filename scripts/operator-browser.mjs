#!/usr/bin/env node
/**
 * Headed browser automation for operator flows (see screen, click, type).
 * Prefers the real Edge profile (saved GitHub logins) on Windows.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

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

function log(...a) {
  console.log("[operator-browser]", ...a);
}

function closeEdgeIfNeeded() {
  if (process.platform !== "win32") return;
  try {
    execSync("taskkill /IM msedge.exe /F", { stdio: "ignore" });
    log("closed existing Edge processes so profile can load");
  } catch {
    /* none running */
  }
}

function resolveProfile(options) {
  if (options.profileDir) return { profileDir: options.profileDir, args: [] };
  if (process.platform === "win32" && options.useSystemEdgeProfile !== false) {
    const edgeData = join(
      process.env.LOCALAPPDATA || "",
      "Microsoft",
      "Edge",
      "User Data",
    );
    if (existsSync(edgeData)) {
      closeEdgeIfNeeded();
      return {
        profileDir: edgeData,
        args: ["--profile-directory=Default"],
      };
    }
  }
  return { profileDir: defaultProfile, args: [] };
}

async function snap(page, name) {
  mkdirSync(screenshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(screenshotDir, `${stamp}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log("screenshot", path);
  return path;
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

export async function flyAuthViaBrowser(authUrl, options = {}) {
  const { timeoutMs = 1_200_000, channel = "msedge" } = options;
  const { profileDir, args } = resolveProfile(options);

  mkdirSync(profileDir, { recursive: true });
  log("Launching headed browser (channel:", channel + ")");
  log("Profile:", profileDir);
  log("Auth URL:", authUrl);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    slowMo: 80,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    args,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  let lastUrl = "";
  let pollCount = 0;

  try {
    await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await snap(page, "01-fly-auth");

    await clickIfVisible(
      page,
      page.getByRole("link", { name: /sign in with github/i }),
      "Sign in with GitHub",
    );

    await page.waitForTimeout(2000);
    await snap(page, "02-github-redirect");

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
        log("Fly OAuth redirect complete:", url);
        break;
      }

      const successText = page.getByText(
        /success|complete|authenticated|you.?re signed in/i,
      );
      if (await successText.isVisible().catch(() => false)) {
        log("Fly auth success message detected");
        break;
      }

      await clickIfVisible(
        page,
        page.getByRole("button", { name: /^authorize/i }),
        "Authorize Fly (retry)",
      );
      await page.waitForTimeout(3000);
    }

    await snap(page, "99-done");
  } finally {
    await context.close();
  }
}
