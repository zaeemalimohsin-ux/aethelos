import { test, expect } from "@playwright/test";
import { ONBOARDING, submitCreateIdentityForm } from "./helpers.js";

/**
 * End-to-end happy path through the real client stack: create an identity,
 * back up the recovery phrase, start a community (genesis), and land on the
 * dashboard holding 100% of a fresh Pool. Exercises crypto, IndexedDB keystore,
 * the reducer (via worker), and the full React UI.
 */
test("create identity and start a community", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(ONBOARDING.createCta)).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING.createCta }).click();

  await page.getByLabel("Display name").fill("E2E Tester");
  await page
    .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
    .fill("supersecret123");
  await page.getByLabel(ONBOARDING.confirmDevicePassphrase).fill("supersecret123");
  await submitCreateIdentityForm(page);

  await expect(page.getByText(ONBOARDING.saveRecoveryPhrase)).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(
    page.getByRole("heading", { name: ONBOARDING.startCommunityHeading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: ONBOARDING.createCommunityBtn }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("button", { name: ONBOARDING.joinCommunityBtn }),
  ).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING.startNewCommunityBtn }).click();
  await page.getByLabel("Community name").fill("E2E Community");
  await page.getByRole("button", { name: ONBOARDING.createCommunityBtn }).click();

  await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("100.0%", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Proposals" }).click();
  await expect(page.getByText("Open decisions")).toBeVisible();
  await page.getByRole("button", { name: "Identity" }).click();
  await expect(page.getByText("E2E Tester")).toBeVisible();
});
