import { test, expect } from "@playwright/test";
import {
  onboardGenesis,
  createIdentity,
  getPublicKey,
  buildInviteLink,
  joinViaInviteLink,
  admitJoiner,
  waitForMemberCount,
  getPoolSummary,
  freshContext,
  waitForPool,
  bridgeTransfer,
  waitForSyncConnected,
} from "./helpers.js";

test.describe("disaster recovery", () => {
  test("exporting event log and importing on fresh device perfectly reconstructs pool", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // 1. Setup Alice and Bob and make some activity
    await onboardGenesis(pageA, "Alice", "Recovery Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);

    await bridgeTransfer(pageA, joinerKey, "1000");
    await waitForPool(pageA, (p) => parseFloat(p.balances[joinerKey] || "0") > 990);

    const originalPool = await getPoolSummary(pageA);

    // 2. Export: Alice exports her full event log
    const exportedLog = await pageA.evaluate(() => window.__aethelosTest?.exportLog());
    expect(exportedLog).toBeDefined();

    // 3. Wipe: Create a completely fresh context (simulating new device)
    const ctxC = await freshContext(browser);
    const pageC = await ctxC.newPage();

    // 4. Import: new identity on fresh device, then inject exported log (no genesis)
    await createIdentity(pageC, "Alice Recovered");

    await pageC.evaluate(async (logJson) => {
      const bridge = window.__aethelosTest as any;
      await bridge.disasterRecoveryImport(logJson!);
    }, exportedLog);

    await pageC.reload();

    // 4.5. Unlock the identity to start the controller
    await pageC.getByLabel("Passphrase").fill("e2e-test-pass-123");
    await pageC.getByRole("button", { name: "Unlock" }).click();
    await waitForSyncConnected(pageC, 60_000);

    // 5. Validation: The new state should perfectly match the original state
    await waitForPool(pageC, (p) => p.memberCount === 2, 90_000);

    const recoveredPool = await getPoolSummary(pageC);

    expect(recoveredPool!.totalPoints).toBe(originalPool!.totalPoints);
    expect(recoveredPool!.members.sort().join()).toBe(
      originalPool!.members.sort().join(),
    );
    expect(recoveredPool!.balances[joinerKey]).toBe(originalPool!.balances[joinerKey]);
    expect(recoveredPool!.namespaceId).toBe(originalPool!.namespaceId);

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });
});
