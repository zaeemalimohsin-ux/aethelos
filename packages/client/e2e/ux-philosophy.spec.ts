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

  test("sync indicator opens Connection tab", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Sync Nav Cell");
    await waitForSyncConnected(page);

    await expect(page.getByTestId("network-advanced-panel")).toHaveCount(0);
    await page.getByRole("button", { name: /Open connection settings/i }).click();

    await expect(
      page
        .getByRole("navigation", { name: "Sections" })
        .getByRole("button", { name: "Connection" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("network-advanced-panel")).toBeVisible();
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

  test("offline failure mode surfaces plain connection status", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Offline Philosophy Cell");
    await waitForSyncConnected(page);
    await page.evaluate(() => window.__aethelosTest?.disconnectSyncForTests?.());

    await expect(page.locator(".sync-indicator-btn .muted")).toHaveText("Offline", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Community" }).click();
    await expect(
      page
        .locator(".alert.warning")
        .getByText(/Offline — your actions queue until you're back online/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("philosophy card reflects federation pilot gate", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Pilot Copy Cell");
    await page.getByRole("button", { name: "Community" }).click();
    await page.getByText("How your community works").click();
    const federationOff = await page
      .getByText(/Federation scaling.*off in this pilot build/i)
      .isVisible();
    if (federationOff) {
      await expect(page.getByText(/Scaling up/)).toHaveCount(0);
    } else {
      await expect(page.getByText(/Scaling up/)).toBeVisible();
    }
  });
});
