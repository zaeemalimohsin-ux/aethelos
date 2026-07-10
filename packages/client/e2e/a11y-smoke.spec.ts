import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness.js";
import { createIdentity, startCommunity } from "./helpers.js";

test.describe("Accessibility smoke", () => {
  let peer: PeerDevice;

  test.beforeEach(async ({ browser }) => {
    peer = await OmniHarness.launchPeer(browser as any);
  });

  test.afterEach(async () => {
    await peer.close();
  });

  test("toast host persists and error toasts are assertive", async () => {
    const page = peer.page;
    await page.goto(process.env.BASE_URL || "http://localhost:5173");
    await expect(page.getByTestId("toast-host")).toBeAttached();

    await page.evaluate(async () => {
      const { useStore } = await import("/src/app/store.ts");
      useStore.getState().toast("Can't reach the community connection point", "error");
    });

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Can't reach the community connection point/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("invite modal is labelled and closable", async () => {
    const page = peer.page;
    await createIdentity(page, "Modal User");
    await startCommunity(page, "Modal Test");
    await page.getByRole("button", { name: "Invite people" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
    await expect(dialog.getByRole("heading", { name: "Invite people" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("inputs show keyboard focus outline", async () => {
    const page = peer.page;
    await page.goto(process.env.BASE_URL || "http://localhost:5173");
    await page.getByRole("button", { name: "Create a new identity" }).click();
    const nameInput = page.getByLabel("Display name");
    await nameInput.focus();
    const outlineWidth = await nameInput.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.outlineWidth;
    });
    expect(outlineWidth).not.toBe("0px");
  });

  test("welcome screen is usable on phone width", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(process.env.BASE_URL || "http://localhost:5173");
      await expect(
        page.getByRole("button", { name: "Create a new identity" }),
      ).toBeVisible();
    } finally {
      await peer.close();
    }
  });
});
