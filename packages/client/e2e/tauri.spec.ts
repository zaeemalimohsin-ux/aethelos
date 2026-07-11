import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness.js";
import { acceptAgeAndTerms } from "./helpers.js";
import * as os from "os";
import * as path from "path";
import { rmSync } from "fs";

test.describe("Tauri E2E", () => {
  test.skip(process.platform !== "win32", "Windows desktop only");

  let peer: PeerDevice;

  test.beforeAll(() => {
    // Override platform for this specific test file
    process.env.PLATFORM = "windows";
    try {
      const appData = path.join(
        os.homedir(),
        "AppData",
        "Roaming",
        "org.aethelos.desktop",
      );
      const localAppData = path.join(
        os.homedir(),
        "AppData",
        "Local",
        "org.aethelos.desktop",
      );
      rmSync(appData, { recursive: true, force: true });
      rmSync(localAppData, { recursive: true, force: true });
    } catch (e) {
      console.log("Error clearing app data:", e);
    }
  });

  test.afterAll(() => {
    process.env.PLATFORM = "web";
  });

  test("Tauri E2E: Genesis flow and navigating views", async ({ browser }) => {
    test.setTimeout(120_000); // Tauri boot takes time

    // Launch peer using OmniHarness which handles WebView2 profile isolation and port retries
    peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;

    // Wait for either the create identity or unlock screen
    try {
      await expect(
        page
          .locator('text="Create a new identity"')
          .or(page.locator('text="Use a different identity"'))
          .first(),
      ).toBeVisible({ timeout: 15000 });
    } catch (e) {
      await page.screenshot({ path: "tauri-timeout.png" });
      throw e;
    }

    // If we're on the unlock screen, logout
    if (await page.locator('text="Use a different identity"').isVisible()) {
      await page.locator('text="Use a different identity"').click();
      await expect(page.locator('text="Create a new identity"')).toBeVisible({
        timeout: 5000,
      });
    }

    // 1. Create Identity
    await page.locator('text="Create a new identity"').click();
    await page.fill('input[placeholder="How others see you"]', "Tauri Human");

    const pwInputs = await page.locator('input[type="password"]').all();
    await pwInputs[0].fill("password123");
    await pwInputs[1].fill("password123");

    await acceptAgeAndTerms(page);
    await page.click('button:has-text("Create identity")');

    // 2. Backup screen
    await page.check('input[type="checkbox"]');
    await page.click('button:has-text("Continue")');

    // 3. Choose action
    await page.click('button:has-text("Start a new community")');

    // 4. Start Community
    await page.click('button:has-text("Create community")');

    // 5. Verify Community view
    await expect(page.locator(".app-header")).toContainText("AethelOS", {
      timeout: 30000,
    });

    // 6. Navigate to Proposals
    await page.click('text="Proposals"');
    await expect(page.locator(".app-main")).toContainText("Open decisions");

    // 7. Open Identity View
    await page.click('text="Identity"');
    await expect(page.locator(".app-main")).toContainText("Tauri Human");

    await peer.close();
  });
});
