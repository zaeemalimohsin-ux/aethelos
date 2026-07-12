#!/usr/bin/env node
/**
 * Headed Playwright browser for operator OAuth (Fly / GitHub / Google).
 * Uses a persistent profile so logins survive across runs.
 *
 * Commands:
 *   node scripts/operator-browser.mjs smoke   — verify click/type works
 *   (import) flyAuthViaBrowser(url)           — Fly CLI OAuth flow
 *
 * Env (optional):
 *   OPERATOR_AUTH=google|github|manual  — preferred login path (default: google)
 *   GITHUB_USERNAME / GITHUB_PASSWORD   — fill GitHub form when set
 *   OPERATOR_GOOGLE_EMAIL               — fill Google email step when set
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function snap(page, name) {
  mkdirSync(screenshotDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(screenshotDir, `${stamp}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log("screenshot", path);
  return path;
}

async function humanClick(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.scrollIntoViewIfNeeded();
  await sleep(120 + Math.floor(Math.random() * 180));
  await locator.click({ delay: 60 });
  log("clicked", label);
  return true;
}

async function clickIfVisible(page, locator, label) {
  try {
    if (await locator.isVisible({ timeout: 2500 })) {
      await humanClick(locator, label);
      return true;
    }
  } catch {
    /* not visible */
  }
  return false;
}

async function humanFill(locator, text, label) {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(text, { delay: 35 });
  log("filled", label);
}

function onGitHubLogin(url) {
  return (
    url.includes("github.com/login") ||
    url.includes("github.com/session") ||
    (url.includes("github.com") && url.includes("password"))
  );
}

function onGoogleLogin(url) {
  return url.includes("accounts.google.com");
}

function flyAuthComplete(url) {
  if (url.includes("localhost") || url.includes("127.0.0.1")) return true;
  if (url.includes("fly.io/app/auth/cli")) return true;
  return (
    url.includes("fly.io") &&
    !url.includes("sign-in") &&
    !url.includes("/login") &&
    !url.includes("github.com")
  );
}

async function launchOperatorBrowser(profileDir = defaultProfile) {
  mkdirSync(profileDir, { recursive: true });
  log("Launching headed Edge (profile:", profileDir, ")");
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "msedge",
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/** Verify Playwright can click, type, and submit on a real page. */
export async function browserSmokeTest() {
  const { context, page } = await launchOperatorBrowser(
    join(root, "scripts/.operator-browser-profile-smoke"),
  );
  try {
    await page.goto("https://www.wikipedia.org/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await snap(page, "smoke-01-wikipedia");

    const search = page.locator("#searchInput").first();
    await humanFill(search, "AethelOS", "Wikipedia search");
    await snap(page, "smoke-02-typed");

    await humanClick(page.locator("button[type='submit']").first(), "Search");
    await page.waitForURL(/wikipedia\.org\/wiki\//, { timeout: 30_000 });
    await snap(page, "smoke-03-results");

    const title = await page.title();
    if (!/AethelOS/i.test(title) && !/Search results/i.test(title)) {
      throw new Error(`Unexpected page title after search: ${title}`);
    }
    log("SMOKE PASS — click, type, and submit work");
    return true;
  } finally {
    await context.close();
  }
}

async function tryGitHubLogin(page) {
  const mode = (process.env.OPERATOR_AUTH || "google").toLowerCase();

  if (mode === "google" || mode === "auto") {
    if (
      await clickIfVisible(
        page,
        page.getByRole("button", { name: /continue with google/i }),
        "Continue with Google",
      )
    ) {
      await sleep(2500);
      return true;
    }
  }

  if (mode === "github" || mode === "auto") {
    const user = process.env.GITHUB_USERNAME?.trim();
    const pass = process.env.GITHUB_PASSWORD;
    if (user && pass) {
      const userField = page
        .getByLabel(/username or email/i)
        .or(page.locator("#login_field"))
        .first();
      const passField = page
        .getByLabel(/^password$/i)
        .or(page.locator("#password"))
        .first();
      await humanFill(userField, user, "GitHub username");
      await humanFill(passField, pass, "GitHub password");
      await humanClick(
        page.getByRole("button", { name: /^sign in$/i }),
        "GitHub Sign in",
      );
      await sleep(2500);
      return true;
    }
  }

  return false;
}

async function tryGoogleLogin(page) {
  const email = process.env.OPERATOR_GOOGLE_EMAIL?.trim();
  const emailField = page
    .locator('#identifierId, input[name="identifier"], input[type="email"]')
    .first();
  const hasEmailField = await emailField.isVisible({ timeout: 2000 }).catch(() => false);

  if (email && hasEmailField) {
    await humanFill(emailField, email, "Google email");
    await clickIfVisible(
      page,
      page.getByRole("button", { name: /next/i }),
      "Google Next",
    );
    await sleep(2000);
    return true;
  }

  // Account chooser — click first listed account if visible
  const account = page.locator("[data-email], [data-identifier]").first();
  if (await account.isVisible({ timeout: 1500 }).catch(() => false)) {
    await humanClick(account, "Google account picker");
    await sleep(2000);
    return true;
  }

  if (hasEmailField) {
    log(
      "Google email step — set OPERATOR_GOOGLE_EMAIL or sign in manually in THIS browser window",
    );
  }

  return false;
}

async function oauthStep(page, lastState) {
  const url = page.url();

  if (flyAuthComplete(url)) {
    return { state: "done", url };
  }

  if (url.includes("github.com/login/oauth/authorize")) {
    if (lastState !== "github-authorize") await snap(page, "github-authorize");
    await clickIfVisible(
      page,
      page.getByRole("button", { name: /^authorize/i }),
      "Authorize Fly on GitHub",
    );
    return { state: "github-authorize", url };
  }

  if (onGoogleLogin(url)) {
    if (lastState !== "google-login") await snap(page, "google-login");
    const acted = await tryGoogleLogin(page);
    if (!acted && lastState !== "google-login-manual") {
      log(
        "Complete Google sign-in in THIS browser window (password / 2FA — profile saves for next time)",
      );
    }
    return { state: acted ? "google-login" : "google-login-manual", url };
  }

  if (onGitHubLogin(url)) {
    if (lastState !== "github-login") {
      await snap(page, "github-login");
      log(
        "GitHub login — automating preferred path (OPERATOR_AUTH=",
        process.env.OPERATOR_AUTH || "google",
        ")",
      );
    }
    const acted = await tryGitHubLogin(page);
    if (!acted && lastState !== "github-login-manual") {
      log(
        "Complete GitHub/Google sign-in in THIS browser window (profile saves for next time)",
      );
    }
    return { state: acted ? "github-login" : "github-login-manual", url };
  }

  if (url.includes("fly.io") && (url.includes("auth") || url.includes("sign"))) {
    if (lastState !== "fly-landing") await snap(page, "fly-landing");
    const mode = (process.env.OPERATOR_AUTH || "google").toLowerCase();
    await page
      .getByRole("button", { name: /sign in with (google|github)/i })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    if (mode === "google") {
      const googleBtn = page
        .getByRole("button", { name: /sign in with google/i })
        .or(page.getByRole("link", { name: /sign in with google/i }));
      if (await clickIfVisible(page, googleBtn.first(), "Fly Sign in with Google")) {
        return { state: "fly-google", url };
      }
    }

    if (mode === "github") {
      const githubBtn = page
        .getByRole("button", { name: /sign in with github/i })
        .or(page.getByRole("link", { name: /sign in with github/i }));
      if (await clickIfVisible(page, githubBtn.first(), "Fly Sign in with GitHub")) {
        return { state: "fly-github", url };
      }
    }

    return { state: "fly-landing", url };
  }

  if (
    await page
      .getByText(/success|complete|authenticated|you may now close/i)
      .isVisible()
      .catch(() => false)
  ) {
    return { state: "done", url };
  }

  return { state: lastState || "waiting", url };
}

export async function flyAuthViaBrowser(authUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1_200_000;
  const profileDir = options.profileDir || defaultProfile;
  const { context, page } = await launchOperatorBrowser(profileDir);

  let lastState = "";
  let lastUrl = "";

  try {
    await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await snap(page, "01-start");

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const step = await oauthStep(page, lastState);
      if (step.url !== lastUrl || step.state !== lastState) {
        log("state", step.state, "→", step.url.slice(0, 120));
        lastUrl = step.url;
        lastState = step.state;
      }
      if (step.state === "done") {
        log("Fly OAuth complete");
        break;
      }
      await sleep(1500);
    }

    if (
      !flyAuthComplete(page.url()) &&
      !(await page
        .getByText(/success|complete|authenticated|you may now close/i)
        .isVisible()
        .catch(() => false))
    ) {
      await snap(page, "99-timeout");
      throw new Error(`Fly OAuth timed out — last URL: ${page.url()}`);
    }
    await snap(page, "99-done");
  } finally {
    await context.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const cmd = process.argv[2] || "smoke";
  if (cmd === "smoke") {
    browserSmokeTest().catch((e) => {
      console.error("[operator-browser] SMOKE FAIL:", e.message);
      process.exit(1);
    });
  } else {
    console.error("Usage: node scripts/operator-browser.mjs smoke");
    process.exit(1);
  }
}
