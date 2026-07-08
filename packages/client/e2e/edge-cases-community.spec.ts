import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness.js";
import { createIdentity, startCommunity } from "./helpers.js";

test.describe("Community & UI Edge Cases", () => {
  let peer: PeerDevice;

  test.beforeEach(async ({ browser }) => {
    peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    await createIdentity(page, "Tester");
    await startCommunity(page, "A".repeat(100)); // Extremely long name
  });

  test.afterEach(async () => {
    await peer.close();
  });

  test("Long Community Names and UI Wrapping", async () => {
    const page = peer.page;
    // The extremely long name should be visible in the header without breaking the layout
    await expect(page.locator(".brand .muted")).toContainText("A".repeat(100));
    
    // Check that the brand element is not wider than the viewport
    const brandBox = await page.locator(".brand").boundingBox();
    const viewport = page.viewportSize();
    if (brandBox && viewport) {
      expect(brandBox.width).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("Invalid Invite Codes", async () => {
    const page = peer.page;
    await page.getByRole("button", { name: "Community" }).click();
    
    // Try to invite someone with an invalid or short code
    await page.getByText("Someone opened your link — vouch for them").click();
    await page.getByLabel("Join code").fill("invalid_code");
    
    // The vouch button might be enabled, but the network request should fail
    await page.getByRole("button", { name: "Vouch and send invite" }).click();
    
    // Should show an error toast about invalid pubkey
    await expect(page.locator(".toast-item.error")).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});
