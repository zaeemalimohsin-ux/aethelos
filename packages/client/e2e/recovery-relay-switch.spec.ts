import { test, expect } from "@playwright/test";
import { onboardGenesis, waitForPool, RELAY_URL } from "./helpers.js";

test.describe("Charter D — relay switch recovery", () => {
  test("connection relay change preserves local log state", async ({ page }) => {
    test.setTimeout(120_000);
    await onboardGenesis(page, "Founder", "Relay Switch Cell");
    const before = await waitForPool(page, (p) => p.eventCount >= 2);
    const cellName = before.cellName;
    const eventCount = before.eventCount;

    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Connection" })
      .click();
    await expect(page.getByTestId("network-advanced-panel")).toBeVisible();
    await page.getByText("Manage connection endpoints").click();

    const deadRelay = "ws://127.0.0.1:9/ws";
    await page.getByPlaceholder("wss://relay.example.org:8787").fill(deadRelay);
    await page.getByRole("button", { name: "Add endpoint" }).click();

    await page.getByRole("button", { name: `Remove endpoint ${RELAY_URL}` }).click();

    const afterSwitch = await waitForPool(
      page,
      (p) => p.cellName === cellName && p.eventCount >= eventCount,
    );
    expect(afterSwitch.memberCount).toBe(1);

    await page.getByPlaceholder("wss://relay.example.org:8787").fill(RELAY_URL);
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await waitForPool(page, (p) => p.cellName === cellName && p.eventCount >= eventCount);
  });
});
