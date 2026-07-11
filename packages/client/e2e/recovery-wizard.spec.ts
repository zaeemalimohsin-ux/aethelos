import { test, expect } from "@playwright/test";
import { PASSWORD, getPublicKey, startCommunity, submitCreateIdentityForm } from "./helpers.js";

test.describe("recovery phrase round-trip", () => {
  test("restore from scraped phrase yields the same public key", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto("/");

    await page1.getByRole("button", { name: "Create a new identity" }).click();
    await page1.getByLabel("Display name").fill("Round Trip");
    await page1.getByLabel("Passphrase", { exact: true }).fill(PASSWORD);
    await page1.getByLabel("Confirm passphrase").fill(PASSWORD);
    await submitCreateIdentityForm(page1);
    await expect(page1.getByText("Save your recovery phrase")).toBeVisible({
      timeout: 10_000,
    });

    const words = await page1.locator(".recovery-word span:not(.idx)").allTextContents();
    expect(words).toHaveLength(12);
    const mnemonic = words.join(" ");

    await page1.getByRole("checkbox").check();
    await page1.getByRole("button", { name: /Continue/ }).click();
    await startCommunity(page1, "Recovery Cell");
    const pubkey1 = await getPublicKey(page1);
    await ctx1.close();

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto("/");
    await page2.getByRole("button", { name: "Restore from recovery phrase" }).click();
    await page2.getByLabel("Recovery phrase").fill(mnemonic);
    await page2.getByLabel("Display name").fill("Round Trip Restored");
    await page2.getByLabel("New passphrase (this device)").fill(PASSWORD);
    await page2.getByRole("button", { name: "Restore" }).click();
    await expect(page2.getByText("Identity restored")).toBeVisible({ timeout: 10_000 });
    await page2.getByRole("button", { name: "Skip for now" }).click();
    await startCommunity(page2, "Recovery Cell B");
    const pubkey2 = await getPublicKey(page2);
    expect(pubkey2).toBe(pubkey1);
    await ctx2.close();
  });
});
