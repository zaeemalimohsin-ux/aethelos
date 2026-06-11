import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 667 } });

test("welcome screen is usable on phone width", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create a new identity" })).toBeVisible();
});
