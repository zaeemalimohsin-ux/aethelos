import { test, expect } from "@playwright/test";

/**
 * End-to-end happy path through the real client stack: create an identity,
 * back up the recovery phrase, start a community (genesis), and land on the
 * dashboard holding 100% of a fresh Pool. Exercises crypto, IndexedDB keystore,
 * the reducer (via worker), and the full React UI.
 */
test("create identity and start a community", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Create a new identity")).toBeVisible();
  await page.getByRole("button", { name: "Create a new identity" }).click();

  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByLabel("Passphrase", { exact: true }).fill("supersecret123");
  await page.getByLabel("Confirm passphrase").fill("supersecret123");
  await page.getByRole("button", { name: "Create identity" }).click();

  // Recovery phrase backup screen (PBKDF2 key derivation can take a few seconds).
  await expect(page.getByText("Save your recovery phrase")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Choose action -> start a community.
  await page.getByRole("button", { name: "Start a new community" }).click();
  await expect(page.getByRole("button", { name: "Create community" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Join a community" })).toBeVisible();
  await page.getByRole("button", { name: "Start a new community" }).click();
  await page.getByLabel("Community name").fill("E2E Community");
  await page.getByRole("button", { name: "Create community" }).click();

  // Dashboard: founder holds 100% of the fresh pool.
  await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("100.0%", { exact: true })).toBeVisible();
});
