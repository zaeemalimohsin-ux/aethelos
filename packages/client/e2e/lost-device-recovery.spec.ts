import { test, expect, type Page } from "@playwright/test";
import {
  PASSWORD,
  ONBOARDING,
  startCommunity,
  freshContext,
  waitForMemberCount,
  acceptAgeAndTerms,
  submitCreateIdentityForm,
} from "./helpers.js";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_PARAMETERS, generateKeyPair, signEvent } from "@aethelos/core";

const RESTORE_PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

async function reachImportEventLog(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "I lost my device" }).click();
  await page.getByRole("button", { name: "Continue with recovery phrase" }).click();
  await page.getByLabel("Recovery phrase").fill(RESTORE_PHRASE);
  await page.getByLabel("Display name").fill("Bad Import");
  await page.getByLabel("New passphrase (this device)").fill(PASSWORD);
  await acceptAgeAndTerms(page);
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Reconnect to your community")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /event log export/i }).click();
}

function writeTempJson(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "aethelos-import-"));
  const filePath = join(dir, name);
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

async function orphanOnlyLogJson(): Promise<string> {
  const kp = await generateKeyPair();
  const ns = "e2e-orphan-import";
  const genesis = await signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Orphan",
        initialPoints: "100",
        parameters: DEFAULT_PARAMETERS,
      },
    },
    kp.privateKey,
  );
  const child = await signEvent(
    {
      namespaceId: ns,
      prevHash: genesis.id,
      lamport: 2,
      author: kp.publicKeyHex,
      timestamp: 2,
      payload: {
        type: "transaction",
        to: kp.publicKeyHex,
        amount: "1",
      },
    },
    kp.privateKey,
  );
  return JSON.stringify([child]);
}

test.describe("lost device recovery UI", () => {
  test("imports event log through onboarding UI after phrase restore", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const ctxA = await freshContext(browser);
    const pageA = await ctxA.newPage();
    await pageA.goto("/");
    await pageA.getByRole("button", { name: ONBOARDING.createCta }).click();
    await pageA.getByLabel("Display name").fill("Lost Device Founder");
    await pageA.getByLabel(ONBOARDING.devicePassphrase, { exact: true }).fill(PASSWORD);
    await pageA.getByLabel(ONBOARDING.confirmDevicePassphrase).fill(PASSWORD);
    await submitCreateIdentityForm(pageA);
    await expect(pageA.getByText(ONBOARDING.saveRecoveryPhrase)).toBeVisible({
      timeout: 10_000,
    });
    const words = await pageA.locator(".recovery-word span:not(.idx)").allTextContents();
    const mnemonic = words.join(" ");
    await pageA.getByRole("checkbox").check();
    await pageA.getByRole("button", { name: /Continue/ }).click();
    await startCommunity(pageA, "Recovery UI Cell");
    await waitForMemberCount(pageA, 1);

    const exportedLog = await pageA.evaluate(() => window.__aethelosTest?.exportLog());
    expect(exportedLog).toBeTruthy();
    const dir = mkdtempSync(join(tmpdir(), "aethelos-log-"));
    const logPath = join(dir, "community-backup.json");
    writeFileSync(logPath, exportedLog!, "utf8");

    const ctxB = await freshContext(browser);
    const pageB = await ctxB.newPage();
    await pageB.goto("/");
    await pageB.getByRole("button", { name: "I lost my device" }).click();
    await pageB.getByRole("button", { name: "Continue with recovery phrase" }).click();
    await pageB.getByLabel("Recovery phrase").fill(mnemonic);
    await pageB.getByLabel("Display name").fill("Lost Device Founder");
    await pageB.getByLabel("New passphrase (this device)").fill(PASSWORD);
    await acceptAgeAndTerms(pageB);
    await pageB.getByRole("button", { name: "Restore" }).click();
    await expect(pageB.getByText("Reconnect to your community")).toBeVisible({
      timeout: 15_000,
    });
    await pageB.getByRole("button", { name: /event log export/i }).click();
    await pageB.locator('input[type="file"]').setInputFiles(logPath);
    await expect(pageB.getByText(/Imported \d+ events/i)).toBeVisible({
      timeout: 15_000,
    });
    await pageB.getByLabel("Passphrase").fill(PASSWORD);
    await pageB.getByRole("button", { name: "Unlock community" }).click();
    await waitForMemberCount(pageB, 1, 90_000);

    unlinkSync(logPath);
    await ctxA.close();
    await ctxB.close();
  });

  test("shows error toast for invalid backup JSON", async ({ page }) => {
    await reachImportEventLog(page);

    const badPath = writeTempJson("bad.json", "not-json");
    await page.locator('input[type="file"]').setInputFiles(badPath);
    await expect(page.getByText("That file isn't valid JSON.")).toBeVisible({
      timeout: 10_000,
    });
    unlinkSync(badPath);
  });

  test("shows error toast for empty event log", async ({ page }) => {
    await reachImportEventLog(page);

    const emptyPath = writeTempJson("empty.json", "[]");
    await page.locator('input[type="file"]').setInputFiles(emptyPath);
    await expect(page.getByText("No community events found in that file.")).toBeVisible({
      timeout: 10_000,
    });
    unlinkSync(emptyPath);
  });

  test("shows error toast for orphan event log", async ({ page }) => {
    await reachImportEventLog(page);

    const orphanPath = writeTempJson("orphan.json", await orphanOnlyLogJson());
    await page.locator('input[type="file"]').setInputFiles(orphanPath);
    await expect(
      page.getByText("That backup is missing required history — try a newer export."),
    ).toBeVisible({ timeout: 10_000 });
    unlinkSync(orphanPath);
  });
});
