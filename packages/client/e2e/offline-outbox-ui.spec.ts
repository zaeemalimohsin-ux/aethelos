import { test, expect } from "@playwright/test";
import { onboardGenesis, waitForPool } from "./helpers.js";

test.describe("offline outbox UI", () => {
  test("pending outbox grows while offline after invite", async ({ page, context }) => {
    await onboardGenesis(page, "Offline Founder", "Offline Cell");
    await context.setOffline(true);
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Community" }).click();
    await page.getByLabel("Join code").fill("b".repeat(64));
    await page.getByRole("button", { name: "Vouch and send invite" }).click();

    const pool = await waitForPool(page, (p) => p.pendingInviteCount >= 1, 30_000);
    expect(pool.pendingInviteCount).toBeGreaterThanOrEqual(1);

    await context.setOffline(false);
  });
});
