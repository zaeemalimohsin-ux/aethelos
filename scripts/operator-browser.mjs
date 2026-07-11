#!/usr/bin/env node
/**
 * Headed Playwright browser for Fly OAuth.
 * Uses a dedicated persistent profile (saved GitHub login after first sign-in).
 * Never kills the user's main Edge window.
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

function onGitHubLogin(url) {
  return (
    url.includes("github.com/login") ||
    url.includes("github.com/session") ||
    (url.includes("github.com") && url.includes("password"))
  );
}

export async function flyAuthViaBrowser(authUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1_200_000;
  const profileDir = options.profileDir || defaultProfile;
  mkdirSync(profileDir, { recursive: true });

  log("Launching headed Edge (persistent profile:", profileDir, ")");
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "msedge",
    headless: false,
    viewport: null,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  let lastUrl = "";
  let pollCount = 0;

  try {
    if (!page.url().includes("fly.io")) {
      await page.goto(authUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    }

    await snap(page, "01-fly-auth");
    await clickIfVisible(
      page,
      page.getByRole("link", { name: /sign in with github/i }),
      "Sign in with GitHub",
    );
    await page.waitForTimeout(2500);
    await snap(page, "02-github");

    if (onGitHubLogin(page.url())) {
      log("Complete GitHub sign-in in the browser window (saved after first time)...");
    }

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
        "Authorize Fly",
      );

      if (onGitHubLogin(url)) {
        await page.waitForTimeout(3000);
        continue;
      }

      await page.waitForTimeout(2000);
    }

    await snap(page, "99-done");
  } finally {
    await context.close();
  }
}
