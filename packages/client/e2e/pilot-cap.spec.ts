import { test, expect } from "@playwright/test";
import { onboardGenesis } from "./helpers.js";

test.describe("standard build member limit", () => {
  test("federation-off build shows member limit copy", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Limit Cell");
    await page.getByRole("button", { name: "Community" }).click();
    await page.getByText("How your community works").click();
    await expect(
      page.getByText(/Linked chapters are not available in this build/i),
    ).toBeVisible();
    await expect(page.getByText("▸ Link chapters")).toHaveCount(0);
  });
});
