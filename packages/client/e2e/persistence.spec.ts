import { test, expect } from '@playwright/test';
import { bootstrapStarCommunity, closeContexts, bridgeCreateProposal, waitForPool } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

test.describe('Persistence & Recovery', () => {

  test('recovers state from IndexedDB after browser refresh', async ({ browser }) => {
    // 1. Bootstrap a community (founder only, no joiners needed)
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Persistence Web",
      []
    );

    // 2. Create a valid proposal (resolve_fracture doesn't require a member target)
    // Use admit_member with a fake pubkey to create any open proposal
    await bridgeCreateProposal(founder, "resolve_fracture", "");

    // Wait for the proposal to register in the pool state
    await waitForPool(founder, (p) => p.proposalCount >= 1, 20_000);

    // 3. Confirm the proposal count via API
    const poolBefore = await founder.evaluate(() => {
      const summary = window.__aethelosTest?.getPoolSummary();
      return summary;
    });
    const proposalCountBefore = (poolBefore as any)?.proposalCount ?? 0;

    // Wait for IndexedDB write to settle
    await founder.waitForTimeout(2000);

    // 4. Reload the page (simulating user closing tab and reopening, or refreshing)
    await founder.reload();
    await founder.waitForTimeout(1000);

    // 5. Unlock the identity (app stores session, shows locked screen)
    await expect(founder.getByRole("button", { name: "Unlock" })).toBeVisible({ timeout: 10000 });
    await founder.getByLabel("Passphrase").fill("e2e-test-pass-123");
    await founder.getByRole("button", { name: "Unlock" }).click();

    // 6. App should restore to ready state
    await expect(founder.getByRole('button', { name: 'Proposals', exact: true })).toBeVisible({ timeout: 30000 });

    // 7. Verify Proposal count recovered from IndexedDB
    // Give the node a moment to replay events from local store
    await waitForPool(founder, (p) => p.proposalCount >= proposalCountBefore, 30_000);

    // Navigate to Proposals view and confirm
    await founder.getByRole('button', { name: 'Proposals', exact: true }).click();

    // The "Nothing open yet" message should NOT be visible
    await expect(founder.getByText('Nothing open yet')).not.toBeVisible({ timeout: 5000 });

    await closeContexts(contexts);
  });

  test('session key survives hard reload - still locked, not wiped', async ({ browser }) => {
    // Verify that a hard reload shows the unlock screen, not onboarding,
    // meaning the session is preserved in localStorage across reloads
    const { founder, contexts } = await bootstrapStarCommunity(
      browser,
      "Persistence Session",
      []
    );

    // Verify we are in ready state
    await expect(founder.getByRole('button', { name: 'Community', exact: true })).toBeVisible();

    // Hard reload
    await founder.reload();
    await founder.waitForTimeout(1000);

    // App should show LOCKED screen (not onboarding)
    // This proves localStorage session survived
    await expect(founder.getByRole("button", { name: "Unlock" })).toBeVisible({ timeout: 10000 });

    // And NOT show "Create a new identity" (which would mean session was wiped)
    await expect(founder.getByRole('button', { name: 'Create a new identity' })).not.toBeVisible();

    await closeContexts(contexts);
  });
});
