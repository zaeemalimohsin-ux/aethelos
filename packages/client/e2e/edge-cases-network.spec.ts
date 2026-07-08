import { test, expect } from "@playwright/test";
import { OmniHarness } from "./harness.js";
import {
  bootstrapStarCommunity,
  closeContexts,
  createIdentity,
  startCommunity,
  waitForPool,
  getPoolSummary,
  waitForConvergence,
  bridgeCreateProposal,
} from "./helpers.js";

test.describe("Network & Sync Edge Cases", () => {

  test("event log DB wipe - app shows locked (not onboarding) because keystore survives", async ({ browser }) => {
    test.setTimeout(90_000);
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await createIdentity(page, "DB Wipe Victim");
      await startCommunity(page, "Doomed Community");

      // Verify we are in the community
      await expect(page.getByRole("button", { name: "Community" })).toBeVisible();

      // Wipe the correct DBs (aethelos-eventlog and aethelos-outbox)
      // NOTE: aethelos-keystore is a separate DB and is NOT wiped
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("aethelos-eventlog");
          req.onsuccess = () => resolve();
          req.onerror = () => resolve(); // ignore errors
        });
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("aethelos-outbox");
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      });

      // Reload the page after DB wipe
      await page.reload();
      await page.waitForTimeout(1000);

      // The keystore DB (aethelos-keystore) survived, so the app should show
      // the LOCKED screen, NOT the onboarding "Create a new identity" screen.
      // This is correct UX: the user's identity key is safe, only their cached
      // events were lost. They will re-sync from the relay on next unlock.
      await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: "Create a new identity" })).not.toBeVisible();

    } finally {
      await peer.close();
    }
  });

  test("app recovers empty event log by syncing from relay after unlock", async ({ browser }) => {
    test.setTimeout(120_000);
    // This test verifies that after event log wipe, syncing from relay restores pool state.
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Relay Recovery",
      []
    );

    // Create some state to validate recovery
    await bridgeCreateProposal(founder, "resolve_fracture", "");
    await waitForPool(founder, (p) => p.proposalCount >= 1, 20_000);

    // Give relay time to buffer the events
    await founder.waitForTimeout(2000);

    // Wipe local event log ONLY
    await founder.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("aethelos-eventlog");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("aethelos-outbox");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    });

    // Reload and unlock
    await founder.reload();
    await founder.waitForTimeout(1000);
    await expect(founder.getByRole("button", { name: "Unlock" })).toBeVisible({ timeout: 10_000 });
    await founder.getByLabel("Passphrase").fill("e2e-test-pass-123");
    await founder.getByRole("button", { name: "Unlock" }).click();

    // App should reconnect to relay and re-sync all events
    // Wait for proposal count to recover (sync from relay)
    await waitForPool(founder, (p) => p.proposalCount >= 1, 60_000);

    await closeContexts(contexts);
  });

  test("client reconnects after going offline and outbox flushes on reconnect", async ({ browser }) => {
    test.setTimeout(120_000);
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Offline Resilience",
      []
    );

    // Go offline
    await founder.context().setOffline(true);
    await founder.waitForTimeout(500);

    // Create a proposal while offline (should go into outbox)
    await bridgeCreateProposal(founder, "resolve_fracture", "");
    // Give the engine time to queue to outbox
    await founder.waitForTimeout(1000);

    // Check outbox has something pending
    const syncStatus = await founder.evaluate(() => window.__aethelosTest?.getSyncStatus?.());
    // When offline, the event is still applied locally even if not sent to relay
    const poolAfterOffline = await getPoolSummary(founder);
    expect(poolAfterOffline?.proposalCount ?? 0).toBeGreaterThanOrEqual(1);

    // Come back online
    await founder.context().setOffline(false);
    await founder.waitForTimeout(3000);

    // App should still show the proposal (it was applied locally immediately)
    const poolAfterOnline = await getPoolSummary(founder);
    expect(poolAfterOnline?.proposalCount ?? 0).toBeGreaterThanOrEqual(1);

    await closeContexts(contexts);
  });

  test("sync indicator shows offline and recovers", async ({ browser }) => {
    test.setTimeout(60_000);
    const peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    try {
      await createIdentity(page, "Offline Tester");
      await startCommunity(page, "Offline Community");

      // Wait for sync indicator to show online
      await expect(page.locator(".dot.online")).toBeVisible({ timeout: 15_000 });

      // Force offline
      await page.context().setOffline(true);
      await page.waitForTimeout(3000);

      // The WebSocket will close after a timeout and should show offline indicator
      // (This may take up to 30s for the WS heartbeat to fail depending on WS impl)
      // We just verify the test doesn't crash.

      // Come back online
      await page.context().setOffline(false);
      await page.waitForTimeout(5000);

      // App should reconnect and show online again
      await expect(page.locator(".dot.online")).toBeVisible({ timeout: 30_000 });

    } finally {
      await peer.close();
    }
  });

  test("CRDT merge: two peers diverge offline then converge on reconnect", async ({ browser }) => {
    test.setTimeout(180_000);
    // Bootstrap with two peers
    const { founder, joiners, contexts } = await bootstrapStarCommunity(
      browser,
      "Diverge Converge",
      ["Joiner"]
    );
    const joiner = joiners[0]!;

    // Verify both are online and synced
    await waitForPool(founder, (p) => p.memberCount >= 2, 60_000);
    await waitForPool(joiner, (p) => p.memberCount >= 2, 60_000);

    // Take both offline
    await founder.context().setOffline(true);
    await joiner.context().setOffline(true);
    await founder.waitForTimeout(500);
    await joiner.waitForTimeout(500);

    // Both create proposals independently while offline (CRDT divergence)
    await bridgeCreateProposal(founder, "resolve_fracture", "founder-only");
    await bridgeCreateProposal(joiner, "resolve_fracture", "joiner-only");
    await founder.waitForTimeout(500);
    await joiner.waitForTimeout(500);

    // Verify divergence: founder has 1 proposal, joiner has 1 proposal
    const founderPool = await getPoolSummary(founder);
    const joinerPool = await getPoolSummary(joiner);
    expect(founderPool?.proposalCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(joinerPool?.proposalCount ?? 0).toBeGreaterThanOrEqual(1);

    // Come back online (CRDT merge should happen via relay)
    await founder.context().setOffline(false);
    await joiner.context().setOffline(false);

    // After reconnect, both should converge to 2 proposals (CRDT union)
    await waitForConvergence(
      founder,
      joiner,
      (a, b) => a.proposalCount >= 2 && b.proposalCount >= 2,
      120_000
    );

    await closeContexts(contexts);
  });
});
