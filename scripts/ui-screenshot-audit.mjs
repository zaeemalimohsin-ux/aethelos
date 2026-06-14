#!/usr/bin/env node
/**
 * Capture screenshots of every major UI screen and button-driven state.
 * Run: relay dev + client dev (VITE_E2E=1), then node scripts/ui-screenshot-audit.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages", "client", "package.json"));
const { chromium } = require("playwright");
const outDir = join(root, "test-results", "ui-audit");
const baseUrl = process.env.AETHELOS_UI_BASE_URL ?? "http://localhost:5173";
const PASSWORD = "audit-pass-123";

let seq = 0;
async function shot(page, name) {
  seq += 1;
  const file = `${String(seq).padStart(3, "0")}-${name}.png`;
  const path = join(outDir, file);
  await page.screenshot({ path, fullPage: true });
  console.log("saved", file);
  return path;
}

async function clickIfVisible(page, locator, name) {
  const el =
    typeof locator === "string" ? page.getByRole("button", { name: locator }) : locator;
  if (await el.isVisible().catch(() => false)) {
    await el.click();
    await page.waitForTimeout(400);
    await shot(page, name);
  }
}

async function openDisclosures(page, prefix) {
  const summaries = page.locator("details > summary");
  const count = await summaries.count();
  for (let i = 0; i < count; i++) {
    const s = summaries.nth(i);
    const text = ((await s.textContent()) ?? `disclosure-${i}`).trim().slice(0, 40);
    const isOpen = await s.evaluate(
      (el) =>
        el.parentElement?.tagName === "DETAILS" && el.parentElement.hasAttribute("open"),
    );
    if (!isOpen) {
      await s.click();
      await page.waitForTimeout(300);
      await shot(page, `${prefix}-disclosure-${i}-${text.replace(/[^a-z0-9]+/gi, "-")}`);
    }
  }
}

async function onboardingFlow(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await shot(page, "onboarding-welcome");

  await page.getByRole("button", { name: "Create a new identity" }).click();
  await shot(page, "onboarding-create-empty");

  await page.getByLabel("Display name").fill("UI Auditor");
  await page.getByLabel("Passphrase", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm passphrase").fill(PASSWORD);
  await shot(page, "onboarding-create-filled");

  await page.getByRole("button", { name: "Back" }).click();
  await shot(page, "onboarding-welcome-back");

  await page.getByRole("button", { name: "Restore from recovery phrase" }).click();
  await shot(page, "onboarding-restore");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "I have an invite link" }).click();
  await shot(page, "onboarding-join-paste");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Create a new identity" }).click();
  await page.getByLabel("Display name").fill("UI Auditor");
  await page.getByLabel("Passphrase", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm passphrase").fill(PASSWORD);
  await page.getByRole("button", { name: "Create identity" }).click();
  await page.getByText("Save your recovery phrase").waitFor({ timeout: 15_000 });
  await shot(page, "onboarding-backup-phrase");

  await page.getByRole("checkbox").check();
  await shot(page, "onboarding-backup-confirmed");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("What would you like to do").waitFor({ timeout: 15_000 });
  await shot(page, "onboarding-choose-action");

  await page.getByRole("button", { name: "Start a new community" }).click();
  await shot(page, "onboarding-start-community-empty");

  await page.getByLabel("Community name").fill("Philosophy Audit Cell");
  await shot(page, "onboarding-start-community-filled");
  await page.getByRole("button", { name: "Create community" }).click();
  await page
    .getByRole("button", { name: "Community", exact: true })
    .waitFor({ timeout: 30_000 });
  await shot(page, "main-cell-initial");
}

async function mainAppFlow(page) {
  const tabs = ["Community", "Governance", "Proposals", "Identity"];
  for (const tab of tabs) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(500);
    await shot(page, `tab-${tab.toLowerCase()}`);
    await openDisclosures(page, `tab-${tab.toLowerCase()}`);
  }

  // Community tab interactions
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await clickIfVisible(page, "Invite people", "cell-invite-people-modal");
  await page.keyboard.press("Escape");

  // Operator share link lives under Identity → Advanced: network
  await page.getByRole("button", { name: "Identity" }).click();
  const network = page.locator("details").filter({
    has: page.getByText("Advanced: network"),
  });
  if (await network.isVisible().catch(() => false)) {
    await network.getByText("Advanced: network").click();
    await shot(page, "identity-advanced-network");
    await clickIfVisible(
      page,
      page.getByRole("button", { name: /Get share link/i }),
      "identity-get-share-link",
    );
  }
  await page.getByRole("button", { name: "Community", exact: true }).click();

  const transferBtn = page.getByRole("button", { name: /Send shares/i });
  if (await transferBtn.isVisible().catch(() => false)) {
    await transferBtn.click();
    await shot(page, "cell-transfer-form");
  }

  // Governance sliders visible
  await page.getByRole("button", { name: "Governance" }).click();
  await openDisclosures(page, "governance");

  // Proposals - cycle proposal kinds
  await page.getByRole("button", { name: "Proposals" }).click();
  const select = page.locator("#kind");
  if (await select.isVisible().catch(() => false)) {
    const options = await select.locator("option").allTextContents();
    for (let i = 0; i < Math.min(options.length, 6); i++) {
      await select.selectOption({ index: i });
      await page.waitForTimeout(200);
      await shot(page, `proposals-kind-${i}`);
    }
  }
  await openDisclosures(page, "proposals");

  // Identity actions
  await page.getByRole("button", { name: "Identity" }).click();
  await clickIfVisible(page, "Export identity", "identity-after-export-click");
  await clickIfVisible(page, "Export event log", "identity-export-log");
  await clickIfVisible(page, "Export diagnostics", "identity-diagnostics");

  const themeDark = page.getByRole("button", { name: "Dark" });
  const themeLight = page.getByRole("button", { name: "Light" });
  if (await themeLight.isVisible().catch(() => false)) {
    await themeLight.click();
    await shot(page, "identity-theme-light");
  }
  if (await themeDark.isVisible().catch(() => false)) {
    await themeDark.click();
    await shot(page, "identity-theme-dark");
  }

  // Lock screen (optional — skip if lock UX differs)
  const lockBtn = page.getByRole("button", { name: "Lock session" });
  if (await lockBtn.isVisible().catch(() => false)) {
    try {
      await lockBtn.click();
      await page.getByRole("button", { name: "Unlock" }).waitFor({ timeout: 10_000 });
      await shot(page, "locked-unlock-screen");
      await page.getByLabel("Passphrase").fill(PASSWORD);
      await shot(page, "locked-passphrase-filled");
      await page.getByRole("button", { name: "Unlock" }).click();
      await page.getByRole("button", { name: "Community", exact: true }).waitFor({
        timeout: 15_000,
      });
      await shot(page, "main-unlocked-return");
    } catch {
      console.log("skipped lock-session flow");
    }
  }
}

async function main() {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  try {
    await onboardingFlow(page);
    await mainAppFlow(page);
    console.log(`\nDone: ${seq} screenshots in ${outDir}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
