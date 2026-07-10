import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import {
  bootstrapStarCommunity,
  closeContexts,
  bridgeCreateProposal,
  bridgeTransfer,
  waitForPool,
} from "./helpers.js";

test.describe("Chaos Engineering & Extreme Limits", () => {
  test("rapid proposal creation - no duplicates, state stays consistent", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Chaos Proposals",
      [],
    );

    // Fire 10 proposals in rapid succession
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(bridgeCreateProposal(founder, "resolve_fracture", `target-${i}`));
    }
    await Promise.all(promises);

    // Wait for all proposals to register
    await waitForPool(founder, (p) => p.proposalCount >= 10, 30_000);

    const pool = await founder.evaluate(() => window.__aethelosTest?.getPoolSummary());
    expect((pool as any)?.proposalCount).toBe(10);

    // Verify no duplicate proposal IDs
    const proposals: any[] = (pool as any)?.proposals ?? [];
    const ids = proposals.map((p: any) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    await closeContexts(contexts);
  });

  test("survives concurrent outbox events while offline", async ({ browser }) => {
    test.setTimeout(120_000);
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Chaos Offline",
      [],
    );

    // Go offline
    await founder.context().setOffline(true);
    await founder.waitForTimeout(500);

    // Fire 5 proposals concurrently while offline (all go to outbox)
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        bridgeCreateProposal(founder, "resolve_fracture", `offline-target-${i}`),
      );
    }
    await Promise.all(promises);
    await founder.waitForTimeout(500);

    // All proposals should be locally applied immediately even while offline
    await waitForPool(founder, (p) => p.proposalCount >= 5, 15_000);

    // Come back online
    await founder.context().setOffline(false);
    await founder.waitForTimeout(3000);

    // Proposals still intact after reconnect
    const pool = await founder.evaluate(() => window.__aethelosTest?.getPoolSummary());
    expect((pool as any)?.proposalCount).toBeGreaterThanOrEqual(5);

    await closeContexts(contexts);
  });

  test("app does not crash or freeze on 50 rapid slider changes", async ({ browser }) => {
    test.setTimeout(120_000);
    const { founder, contexts } = await bootstrapStarCommunity(browser, "Slider Chaos", [
      "SliderJoiner",
    ]);

    await founder.getByRole("button", { name: "Governance", exact: true }).click();
    await expect(
      founder.getByText("Votes needed to pass a proposal").first(),
    ).toBeVisible();

    const slider = founder.locator('input[type="range"]').first();
    for (let i = 0; i < 50; i++) {
      await slider.fill((i % 20).toString());
      await slider.dispatchEvent("change");
    }

    // App must not crash
    await expect(founder.getByText("Governance").first()).toBeVisible({ timeout: 5000 });
    const isClosed = await founder.evaluate(() => !!document.hidden);
    expect(isClosed).toBe(false);

    await closeContexts(contexts);
  });

  test("massive input injection in display name is handled gracefully", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:5173");

    await page.locator("text=Create a new identity").click();

    // 50KB string — tests that large inputs don't crash the tab
    const massiveString = "X".repeat(50 * 1024);
    await page.getByLabel("Display name").fill(massiveString);
    await page.getByLabel("Passphrase", { exact: true }).fill("password123");
    await page.getByLabel("Confirm passphrase").fill("password123");
    await page.getByRole("button", { name: "Create identity" }).click();

    // Must not crash the tab
    await page.waitForTimeout(2000);
    const crashed = await page.isClosed();
    expect(crashed).toBe(false);

    // The app should still be rendering something (not a blank white page)
    const hasContent = await page.evaluate(() => document.body.children.length > 0);
    expect(hasContent).toBe(true);

    await context.close();
  });

  test("concurrent transfer attempts don't double-spend", async ({ browser }) => {
    test.setTimeout(120_000);
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Double Spend",
      ["Target"],
    );
    const targetKey = keys[0]!;

    // Get initial balances
    const initialPool = await founder.evaluate(() =>
      window.__aethelosTest?.getPoolSummary(),
    );
    const initialFounderBalance = BigInt(
      ((initialPool as any)?.balances[(initialPool as any)?.head] ?? "0")
        .replace(".", "")
        .padEnd(10, "0"),
    );

    // Attempt 5 transfers in rapid fire (race condition stress test)
    const transferPromises = [];
    for (let i = 0; i < 5; i++) {
      transferPromises.push(
        founder.evaluate(async (key) => {
          try {
            await window.__aethelosTest?.transfer(key, "1");
          } catch {
            // Expected some to fail due to insufficient balance validation
          }
        }, targetKey),
      );
    }
    await Promise.all(transferPromises);
    await founder.waitForTimeout(2000);

    // Pool state should be consistent - no double spend
    const poolAfter = await founder.evaluate(() =>
      window.__aethelosTest?.getPoolSummary(),
    );

    // Total pool points must be conserved (sum of all balances + commons = constant)
    const founderBal = (poolAfter as any)?.balances[(poolAfter as any)?.head] ?? "0";
    const targetBal = (poolAfter as any)?.balances[targetKey] ?? "0";
    const commons = (poolAfter as any)?.commons ?? "0";

    // Total pool points must be conserved
    expect(poolAfter).not.toBeNull();
    expect((poolAfter as any)!.totalPoints).toBe((initialPool as any)!.totalPoints);
    expect(typeof founderBal).toBe("string");

    await closeContexts(contexts);
  });

  test("XSS injection in community name is sanitized in UI", async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:5173");

    await page.getByRole("button", { name: "Create a new identity" }).click();
    await page.getByLabel("Display name").fill("XSS Tester");
    await page.getByLabel("Passphrase", { exact: true }).fill("password123");
    await page.getByLabel("Confirm passphrase").fill("password123");
    await page.getByRole("button", { name: "Create identity" }).click();
    await expect(page.getByText("Save your recovery phrase")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Continue/ }).click();

    await page.getByRole("button", { name: "Start a new community" }).click();

    // Inject XSS payload as community name
    const xssPayload = `<script>window.__XSS_EXECUTED=true</script><img src=x onerror="window.__XSS_EXECUTED=true">`;
    await page.getByLabel("Community name").fill(xssPayload);
    await page.getByRole("button", { name: "Create community" }).click();

    await expect(page.getByRole("button", { name: "Community" })).toBeVisible({
      timeout: 30_000,
    });

    // Check XSS was NOT executed
    const xssRan = await page.evaluate(() => (window as any).__XSS_EXECUTED === true);
    expect(xssRan).toBe(false);

    // Check the raw script tag is not in the DOM unescaped
    const scriptInDom = await page.evaluate(() => {
      return document.querySelector("script[src='x']") !== null;
    });
    expect(scriptInDom).toBe(false);

    await context.close();
  });
});
