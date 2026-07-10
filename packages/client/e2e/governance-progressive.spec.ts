import { test, expect } from "@playwright/test";
import { onboardGenesis } from "./helpers.js";

test.describe("governance progressive disclosure", () => {
  test("solo founder hides governance sliders but shows redistribution card", async ({
    page,
  }) => {
    await onboardGenesis(page, "Solo Founder", "Solo Cell");
    await page.getByRole("button", { name: "Governance", exact: true }).click();
    await expect(
      page.getByText(/Invite at least one more member before tuning governance sliders/i),
    ).toBeVisible();
    await expect(page.getByText("Direct your flow")).toBeVisible();
    await expect(page.getByText("Annual circulation (%)")).toHaveCount(0);
    await expect(page.getByText("Votes needed to pass a proposal")).toHaveCount(0);
  });
});
