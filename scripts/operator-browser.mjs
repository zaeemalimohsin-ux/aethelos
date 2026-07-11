#!/usr/bin/env node
/**
 * Headed browser automation for operator flows (see screen, click, type).
 * Uses Playwright with a persistent profile so GitHub/Fly sessions survive runs.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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

/**
 * Drive Fly CLI OAuth in a visible browser. User can type credentials when needed.
 */
export async function flyAuthViaBrowser(authUrl, options = {}) {
  const {
    profileDir = defaultProfile,
    timeoutMs = 600_000,
    channel = "msedge",
  } = options;

  mkdirSync(profileDir, { recursive: true });
  log("Launching headed browser (channel:", channel + ")");
  log("Profile:", profileDir);
  log("Auth URL:", authUrl);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    slowMo: 120,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page = context.pages()[0] ?? (await context.newPage());

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

    // GitHub login form — operator can type in the visible window
    const onGitHubLogin = page.url().includes("github.com/login");
    if (onGitHubLogin) {
      log("GitHub login visible — type credentials in the browser window if prompted");
    }

    // OAuth authorize button
    await clickIfVisible(
      page,
      page.getByRole("button", { name: /^authorize/i }),
      "Authorize Fly",
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = page.url();
      await snap(page, "poll");

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

      // Retry authorize if it appears late
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
