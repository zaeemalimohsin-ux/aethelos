import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import { onboardGenesis } from "./helpers.js";
import { isPublicShareUrl } from "./desktop-share-helpers.js";
import * as os from "os";
import * as path from "path";
import { rmSync } from "fs";

test.describe("desktop invite cold path", () => {
  test.skip(!process.env.AETHELOS_DESKTOP_E2E, "Set AETHELOS_DESKTOP_E2E=1");
  test.skip(process.platform !== "win32", "Windows desktop only");
  test.describe.configure({ retries: process.env.CI ? 1 : 0 });

  test.beforeAll(() => {
    process.env.PLATFORM = "windows";
    try {
      const appData = path.join(
        os.homedir(),
        "AppData",
        "Roaming",
        "org.aethelos.desktop",
      );
      const localAppData = path.join(
        os.homedir(),
        "AppData",
        "Local",
        "org.aethelos.desktop",
      );
      rmSync(appData, { recursive: true, force: true });
      rmSync(localAppData, { recursive: true, force: true });
    } catch (e) {
      console.log("Error clearing app data:", e);
    }
  });

  test.afterAll(() => {
    process.env.PLATFORM = "web";
  });

  test("Invite people uses public share URL without visiting Connection first", async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    const peer = await OmniHarness.launchPeer(browser);
    const page = peer.page;

    await onboardGenesis(page, "Founder", "Cold Invite Cell");

    await page.getByRole("button", { name: "Invite people" }).click();
    await expect(page.getByRole("dialog", { name: "Invite people" })).toBeVisible({
      timeout: 30_000,
    });

    const inviteField = page.locator('[data-testid="invite-link"]');
    await expect
      .poll(
        async () => {
          if (!(await inviteField.isVisible().catch(() => false))) return "";
          return (await inviteField.inputValue()).trim();
        },
        { timeout: 240_000 },
      )
      .toMatch(/trycloudflare\.com/);

    const url = (await inviteField.inputValue()).trim();
    expect(url).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(isPublicShareUrl(url)).toBe(true);

    await peer.close();
  });
});
