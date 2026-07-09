import { test, expect } from "@playwright/test";

test("Web E2E: Genesis flow and navigating views", async ({ page }) => {
  await page.goto("/");

  // 1. Create Identity
  await page.click('text="Create a new identity"');
  await page.fill('input[placeholder="How others see you"]', "Web Human");

  const pwInputs = await page.locator('input[type="password"]').all();
  await pwInputs[0].fill("password123");
  await pwInputs[1].fill("password123");

  await page.click('button:has-text("Create identity")');

  // 2. Backup screen
  await page.check('input[type="checkbox"]');
  await page.click('button:has-text("Continue")');

  // 3. Choose action
  await page.click('button:has-text("Start a new community")');

  // 4. Start Community
  // Pre-filled with "My Community", just click create
  await page.click('button:has-text("Create community")');

  // 5. Verify Community view
  await expect(page.locator(".app-header")).toContainText("AethelOS");
  await expect(page.locator(".app-header")).toContainText("My Community");

  // 6. Navigate to Proposals
  await page.click('text="Proposals"');
  await expect(page.locator(".app-main")).toContainText("Open decisions");

  // 7. Open Identity View
  await page.click('text="Identity"');
  await expect(page.locator(".app-main")).toContainText("Web Human");
});
