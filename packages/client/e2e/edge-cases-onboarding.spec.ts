import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import { closeContexts } from "./helpers.js";

test.describe("Onboarding & Authentication Edge Cases", () => {
  test("passphrase validation (non-matching, empty, short)", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await expect(page.getByText("Create a new identity")).toBeVisible();
      await page.getByRole("button", { name: "Create a new identity" }).click();

      await page.getByLabel("Display name").first().fill("Edge Case Tester");

      // Test 1: Empty passphrase
      await expect(page.getByRole("button", { name: "Create identity" })).toBeDisabled();

      // Test 2: Non-matching passphrases
      await page.getByLabel("Passphrase", { exact: true }).first().fill("secret123");
      await page.getByLabel("Confirm passphrase").first().fill("secret456");
      await expect(page.getByRole("button", { name: "Create identity" })).toBeDisabled();
      await expect(page.getByText("Passphrases do not match")).toBeVisible();

      // Success case to move on
      await page.getByLabel("Passphrase", { exact: true }).first().fill("supersecret123");
      await page.getByLabel("Confirm passphrase").first().fill("supersecret123");
      await page.getByRole("button", { name: "Create identity" }).click();

      await expect(page.getByText("Save your recovery phrase")).toBeVisible({
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
      await expect(page.getByText("Create a new identity")).toBeVisible();
      await page.getByRole("button", { name: "Create a new identity" }).click();
      await page.getByLabel("Display name").first().fill("To Be Overwritten");
      await page.getByLabel("Passphrase", { exact: true }).first().fill("supersecret123");
      await page.getByLabel("Confirm passphrase").first().fill("supersecret123");
      await page.getByRole("button", { name: "Create identity" }).click();

      // Back up screen
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /Continue/ }).click();

      // Start a community so we enter the MainApp shell
      await page.getByRole("button", { name: "Start a new community" }).click();
      await page.getByLabel("Community name").fill("Import Test Mesh");
      await page.getByRole("button", { name: "Create community" }).click();

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
});
