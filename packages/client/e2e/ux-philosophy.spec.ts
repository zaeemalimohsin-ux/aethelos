import { test, expect } from "@playwright/test";
import { onboardGenesis, waitForSyncConnected } from "./helpers.js";

/**
 * UX philosophy alignment: one invite flow, plain connection language,
 * infrastructure tucked under Connection.
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
    await expect(page.getByRole("button", { name: /Connected|Syncing/ })).toBeVisible();
  });

  test("governance shows redistribution as a primary card", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Redistribution Cell");
    await page.getByRole("button", { name: "Governance", exact: true }).click();
    await expect(page.getByText("Direct your flow")).toBeVisible();
    await expect(page.getByText("Advanced: redistribution sliders")).toHaveCount(0);
  });

  test("relay settings live on the Connection tab", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Advanced Network Cell");
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Connection" })
      .click();
    await expect(page.getByTestId("network-advanced-panel")).toBeVisible();
    await expect(page.getByText(/Community endpoints:/)).toBeVisible();

    await page.getByRole("button", { name: "Identity" }).click();
    await expect(page.getByTestId("network-advanced-panel")).toHaveCount(0);
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
