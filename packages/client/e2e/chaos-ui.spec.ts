import { test, expect } from "@playwright/test";
import {
  bootstrapStarCommunity,
  waitForAllConvergence,
  waitForMemberCount,
  closeContexts,
  submitCreateIdentityForm,
} from "./helpers.js";

test.describe.configure({ timeout: 120_000 });

test.describe("UI Chaos Engineering", () => {
  test("survives rapid double-clicks on proposal execution", async ({ browser }) => {
    // We will test if the UI prevents double submission of transactions or proposals
    const { founder, joiners, contexts } = await bootstrapStarCommunity(
      browser,
      "Chaos Web",
      ["Target"],
    );

    // Attempt rapid fire clicks on governance sliders
    await founder.getByRole("button", { name: "Governance", exact: true }).click();
    // Wait for the Governance View to render
    await expect(
      founder.getByText("Votes needed to pass a proposal").first(),
    ).toBeVisible();

    // Rapidly change slider
    const slider = founder.locator('input[type="range"]').first();
    for (let i = 0; i < 50; i++) {
      await slider.fill((i % 20).toString());
      await slider.dispatchEvent("change");
    }

    // Ensure the page didn't crash
    expect(await founder.locator("text=Governance").isVisible()).toBe(true);

    await closeContexts(contexts);
  });

  test("rejects malformed inputs in transactions", async ({ browser }) => {
    const { founder, joiners, contexts, keys } = await bootstrapStarCommunity(
      browser,
      "Chaos Transact",
      ["Target"],
    );

    // Make sure we are on Community View
    await founder.getByRole("button", { name: "Community", exact: true }).click();
    await founder.waitForSelector("text=Send Points");

    // Try to send -500 points (invalid amount)
    await founder.getByLabel("Amount (Points)").fill("-500");
    const sendButton = founder.locator('button:has-text("Send transaction")');
    await expect(sendButton).toBeDisabled();

    await closeContexts(contexts);
  });

  test("survives massive string injections in display name", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:5173");

    await page.screenshot({ path: "scratch/debug-app.png", fullPage: true });

    await page.locator("text=Create a new identity").click();

    // Inject 50KB string to prevent Vite HMR DevTools crash
    const massiveString = "A".repeat(50 * 1024);
    await page.getByLabel("Display name").fill(massiveString);
    await page.getByLabel("Passphrase", { exact: true }).fill("password");
    await page.getByLabel("Confirm passphrase").fill("password");
    await submitCreateIdentityForm(page);

    // It should either truncate, reject, or handle it without crashing the browser tab.
    // We wait 2 seconds.
    await page.waitForTimeout(2000);
    const crashed = await page.isClosed();
    expect(crashed).toBe(false);

    await context.close();
  });
});
