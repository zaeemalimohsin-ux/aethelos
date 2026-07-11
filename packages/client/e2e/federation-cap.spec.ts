import { test, expect } from "@playwright/test";
import { onboardGenesis, getPoolSummary } from "./helpers.js";

test.describe("federation at-cap UX", () => {
  test("invite card shows linked-chapter guidance at 50 members", async ({ page }) => {
    await onboardGenesis(page, "Founder", "Cap Cell");
    await expect
      .poll(async () => (await getPoolSummary(page))?.memberCount ?? 0, {
        timeout: 15_000,
      })
      .toBe(1);

    await page.getByRole("button", { name: "Community" }).click();

    const inflated = await page.evaluate(() => {
      return window.__aethelosTest?.inflateMemberCountForTesting(50) ?? false;
    });
    expect(inflated).toBe(true);

    const inviteCard = page.locator(".card").filter({ hasText: "Invite people" });
    await expect(inviteCard.getByText(/At capacity \(50 members\)/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(inviteCard.getByText(/linked chapters/i)).toBeVisible();
  });
});
