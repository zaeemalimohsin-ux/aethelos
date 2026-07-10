import { test, expect } from "@playwright/test";
import { onboardGenesis } from "./helpers.js";

test.describe("pilot federation cap", () => {
  test("pilot-off build hides Link chapters federation UI", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Pilot Off Cell");
    await page.getByRole("button", { name: "Community" }).click();
    await page.getByText("How your community works").click();
    await expect(
      page.getByText(/Federation scaling.*off in this pilot build/i),
    ).toBeVisible();
    await expect(page.getByText("▸ Link chapters")).toHaveCount(0);
  });
});
