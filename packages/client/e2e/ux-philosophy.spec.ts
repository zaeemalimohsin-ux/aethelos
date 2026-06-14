import { test, expect } from "@playwright/test";
import { onboardGenesis, waitForSyncConnected } from "./helpers.js";

/**
 * UX philosophy alignment: one invite flow, plain connection language,
 * infrastructure tucked under Identity → Advanced: network.
 */
test.describe("philosophy UX", () => {
  test("community tab centers Invite people and hides relay infrastructure", async ({
    page,
  }) => {
    await onboardGenesis(page, "Founder", "Philosophy Cell");
    await waitForSyncConnected(page);

    await expect(page.getByRole("button", { name: "Invite people" })).toBeVisible();
    await expect(page.getByText("Reach others")).toHaveCount(0);
    await expect(page.getByText("Share invite link")).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: /Connected|Syncing/ }),
    ).toBeVisible();
  });

  test("relay settings live under Identity → Advanced: network", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Advanced Network Cell");
    await page.getByRole("button", { name: "Identity" }).click();

    const network = page.locator("details").filter({
      has: page.getByText("Advanced: network"),
    });
    await expect(network).toBeVisible();
    await network.getByText("Advanced: network").click();
    await expect(page.getByTestId("network-advanced-panel")).toBeVisible();
    await expect(page.getByText(/Community endpoints:/)).toBeVisible();
  });

  test("welcome screen does not expose join before identity", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Create a new identity" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Join a community" })).toHaveCount(0);
    await expect(page.getByText("Share invite link")).toHaveCount(0);
  });
});
