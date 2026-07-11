import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import {
  closeContexts,
  submitCreateIdentityForm,
  acceptAgeAndTerms,
  ONBOARDING,
} from "./helpers.js";

test.describe("Onboarding & Authentication Edge Cases", () => {
  test("age gate blocks create identity until accepted", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await page.getByRole("button", { name: ONBOARDING.createCta }).click();
      await page.getByLabel("Display name").fill("Age Gate Tester");
      await page
        .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
        .fill("supersecret123");
      await page.getByLabel(ONBOARDING.confirmDevicePassphrase).fill("supersecret123");
      await expect(
        page.getByRole("button", { name: ONBOARDING.createIdentityBtn }),
      ).toBeDisabled();
      await acceptAgeAndTerms(page);
      await expect(
        page.getByRole("button", { name: ONBOARDING.createIdentityBtn }),
      ).toBeEnabled();
    } finally {
      await peer.close();
    }
  });

  test("passphrase validation (non-matching, empty, short)", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await expect(page.getByText(ONBOARDING.createCta)).toBeVisible();
      await page.getByRole("button", { name: ONBOARDING.createCta }).click();

      await page.getByLabel("Display name").first().fill("Edge Case Tester");

      await expect(
        page.getByRole("button", { name: ONBOARDING.createIdentityBtn }),
      ).toBeDisabled();

      await page
        .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
        .first()
        .fill("secret123");
      await page.getByLabel(ONBOARDING.confirmDevicePassphrase).first().fill("secret456");
      await expect(
        page.getByRole("button", { name: ONBOARDING.createIdentityBtn }),
      ).toBeDisabled();
      await expect(page.getByText("Passphrases do not match")).toBeVisible();

      await page
        .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
        .first()
        .fill("supersecret123");
      await page
        .getByLabel(ONBOARDING.confirmDevicePassphrase)
        .first()
        .fill("supersecret123");
      await submitCreateIdentityForm(page);

      await expect(page.getByText(ONBOARDING.saveRecoveryPhrase)).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await peer.close();
    }
  });

  test("corrupt identity import", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await expect(page.getByText(ONBOARDING.createCta)).toBeVisible();
      await page.getByRole("button", { name: ONBOARDING.createCta }).click();
      await page.getByLabel("Display name").first().fill("To Be Overwritten");
      await page
        .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
        .first()
        .fill("supersecret123");
      await page
        .getByLabel(ONBOARDING.confirmDevicePassphrase)
        .first()
        .fill("supersecret123");
      await submitCreateIdentityForm(page);

      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /Continue/ }).click();

      await page.getByLabel("Community name").fill("Import Test Mesh");
      await page.getByRole("button", { name: ONBOARDING.createCommunityBtn }).click();

      // Wait for community view
      await expect(page.getByRole("button", { name: "Community" })).toBeVisible();

      // Go to Identity view
      await page.getByRole("button", { name: "Identity" }).click();

      await expect(page.getByText("Import identity")).toBeVisible();

      // Create a fake corrupt .aes file in memory
      const corruptFile = Buffer.from("this is not a valid aes file content");

      const fileChooserPromise = page.waitForEvent("filechooser");
      // Click the label for Import identity which contains the file input
      await page.getByText("Import identity").click();
      const fileChooser = await fileChooserPromise;

      await fileChooser.setFiles({
        name: "corrupt-identity.aes",
        mimeType: "application/octet-stream",
        buffer: corruptFile,
      });

      // Expect an error message toast
      await expect(page.getByText(/Invalid identity file/i)).toBeVisible({
        timeout: 5000,
      });
    } finally {
      await peer.close();
    }
  });

  test("recovery phrase fuzzing", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await page.getByRole("button", { name: "Restore from recovery phrase" }).click();

      // Test 1: Invalid word
      await page
        .getByLabel("Recovery phrase")
        .first()
        .fill("apple banana cherry dog elephant frog grape hat ice juice kite lizard"); // 12 words
      await page.getByLabel("Display name").first().fill("Fuzzer");
      await page
        .getByLabel("New passphrase (this device)")
        .first()
        .fill("supersecret123");

      await expect(page.getByText(/Not a valid 12-word phrase/i)).toBeVisible();
      await expect(page.getByRole("button", { name: "Restore" })).toBeDisabled();

      // Test 2: Only 11 words
      await page
        .getByLabel("Recovery phrase")
        .first()
        .fill("apple banana cherry dog elephant frog grape hat ice juice kite");
      await expect(page.getByText(/Not a valid 12-word phrase/i)).toBeVisible();
      await expect(page.getByRole("button", { name: "Restore" })).toBeDisabled();
    } finally {
      await peer.close();
    }
  });

  test("age gate blocks restore until accepted", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await page.getByRole("button", { name: "Restore from recovery phrase" }).click();
      await page
        .getByLabel("Recovery phrase")
        .fill(
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        );
      await page.getByLabel("Display name").fill("Restore Age Tester");
      await page.getByLabel("New passphrase (this device)").fill("supersecret123");
      await expect(page.getByRole("button", { name: "Restore" })).toBeDisabled();
      await acceptAgeAndTerms(page);
      await expect(page.getByRole("button", { name: "Restore" })).toBeEnabled();
    } finally {
      await peer.close();
    }
  });
});
