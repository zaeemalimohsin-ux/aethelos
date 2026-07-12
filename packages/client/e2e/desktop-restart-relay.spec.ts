import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import { onboardGenesis, decodeInviteFromLink } from "./helpers.js";
import * as os from "os";
import * as path from "path";
import { rmSync } from "fs";

test.describe("desktop restart relay sync", () => {
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

  test("invite relays match tunnel URL after simulated restart", async ({ browser }) => {
    test.setTimeout(360_000);
    const peer = await OmniHarness.launchPeer(browser);
    const page = peer.page;

    await onboardGenesis(page, "Founder", "Relay Sync Cell");

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

    const firstLink = (await inviteField.inputValue()).trim();
    const firstPayload = decodeInviteFromLink(firstLink);
    const firstHost = new URL(firstLink.split("#")[0] ?? firstLink).hostname;
    expect(firstPayload.relays?.some((r) => r.includes(firstHost))).toBe(true);

    const rotatedHost = firstHost.replace(/^[^.]+/, "rotated-restart-test");
    const rotatedHttps = `https://${rotatedHost}`;

    await page.evaluate(async (newUrl) => {
      const bridge = window.__aethelosTest;
      if (!bridge?.rotateDesktopTunnelUrlForTests) {
        throw new Error("E2E test bridge missing rotateDesktopTunnelUrlForTests");
      }
      await bridge.rotateDesktopTunnelUrlForTests(newUrl);
    }, rotatedHttps);

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Invite people" }).click();
    await expect(page.getByRole("dialog", { name: "Invite people" })).toBeVisible({
      timeout: 30_000,
    });

    await expect
      .poll(
        async () => {
          if (!(await inviteField.isVisible().catch(() => false))) return "";
          return (await inviteField.inputValue()).trim();
        },
        { timeout: 120_000 },
      )
      .toMatch(/rotated-restart-test/);

    const secondLink = (await inviteField.inputValue()).trim();
    const secondPayload = decodeInviteFromLink(secondLink);
    const secondHost = new URL(secondLink.split("#")[0] ?? secondLink).hostname;
    expect(secondHost).toBe(rotatedHost);
    expect(secondPayload.relays?.some((r) => r.includes(rotatedHost))).toBe(true);
    expect(secondPayload.relays?.some((r) => r.includes(firstHost))).toBe(false);

    await peer.close();
  });
});
