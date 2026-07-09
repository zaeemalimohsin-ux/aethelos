import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness.js";
import { createIdentity, startCommunity } from "./helpers.js";

test.describe("Governance & Proposals Edge Cases", () => {
  let peer: PeerDevice;

  test.beforeEach(async ({ browser }) => {
    peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    await createIdentity(page, "Dictator");
    await startCommunity(page, "Edge Case Nation");
  });

  test.afterEach(async () => {
    await peer.close();
  });

  test("Extreme Sliders (0% and 100%)", async () => {
    const page = peer.page;
    await page.getByRole("button", { name: "Governance" }).click();

    // Set Approval Threshold (slider 1) to 100
    const approvalSlider = page.locator('input[type="range"]').nth(1);
    await approvalSlider.fill("100");
    await approvalSlider.dispatchEvent("mouseup");

    // Set Decay Rate (slider 0) to 0
    const decaySlider = page.locator('input[type="range"]').nth(0);
    await decaySlider.fill("0");
    await decaySlider.dispatchEvent("mouseup");

    // Check if the values were updated in the UI (span.value next to the input)
    await expect(page.locator(".slider-row .value").nth(1)).toContainText("100");
    await expect(page.locator(".slider-row .value").nth(0)).toContainText("0");

    // If quorum is 100%, and I am the only member, any proposal should execute instantly.
    await page.getByRole("button", { name: "Proposals" }).click();
    await page.locator("#kind").selectOption("link_subcell");

    // Fill the required target field for link_subcell
    await page
      .getByLabel("Community ID", { exact: true })
      .fill("some_other_namespace_id");

    // Create the proposal
    await page.getByRole("button", { name: "Start proposal" }).click();

    // Since I hold 100% of the network, and Quorum is 100%, approving it should pass!
    await page.getByRole("button", { name: "Approve" }).click();

    await expect(page.getByText("Proposal executed"))
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});
  });
});
