import { test, expect } from "@playwright/test";
import { bootstrapStarCommunity, closeContexts } from "./helpers.js";

test.describe("Governance & Proposals Edge Cases", () => {
  test("Extreme Sliders (0% and 100%)", async ({ browser }) => {
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Edge Case Nation",
      ["Ally"],
    );
    const page = founder;
    await page.getByRole("button", { name: "Governance" }).click();

    const approvalSlider = page.locator('input[type="range"]').nth(1);
    await approvalSlider.fill("100");
    await approvalSlider.dispatchEvent("mouseup");

    const decaySlider = page.locator('input[type="range"]').nth(0);
    await decaySlider.fill("0");
    await decaySlider.dispatchEvent("mouseup");

    await expect(page.locator(".slider-row .value").nth(1)).toContainText("100");
    await expect(page.locator(".slider-row .value").nth(0)).toContainText("0");

    await closeContexts(contexts);
  });
});
