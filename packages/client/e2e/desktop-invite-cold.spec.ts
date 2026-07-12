import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import { onboardGenesis } from "./helpers.js";

test.describe("desktop invite cold path", () => {
  test.skip(!process.env.AETHELOS_DESKTOP_E2E, "Set AETHELOS_DESKTOP_E2E=1");
  test.skip(process.platform !== "win32", "Windows desktop only");

  test.beforeAll(() => {
    process.env.PLATFORM = "windows";
  });

  test.afterAll(() => {
    process.env.PLATFORM = "web";
  });

  test("Invite people uses public share URL without visiting Connection first", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const peer = await OmniHarness.launchPeer(browser);
    const page = peer.page;

    await onboardGenesis(page, "Founder", "Cold Invite Cell");
    await page.getByRole("button", { name: "Invite people" }).click();
    await expect(page.getByRole("dialog", { name: "Invite people" })).toBeVisible({
      timeout: 30_000,
    });

    const inviteField = page.locator('[data-testid="invite-link"]');
    await expect(inviteField).toBeVisible({ timeout: 180_000 });
    const url = (await inviteField.inputValue()).trim();
    expect(url).toMatch(/trycloudflare\.com/);
    expect(url).not.toMatch(/localhost|127\.0\.0\.1/);

    await peer.close();
  });
});
