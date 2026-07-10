import { test, expect } from "@playwright/test";
import {
  onboardGenesis,
  getPublicKey,
  buildInviteLink,
  joinViaInviteLink,
  admitJoiner,
  waitForMemberCount,
  waitForConvergence,
  getPoolSummary,
  waitForPool,
  bridgeTransfer,
  bridgeAdvanceCirculation,
  bridgeUpdateSlider,
  bootstrapStarCommunity,
  governanceParamNear,
  freshContext,
  sendOnChainInvite,
  bridgeCreateProposal,
  bridgeVoteProposal,
} from "./helpers.js";

test.describe("two-person genesis & join", () => {
  test("founder and joiner converge on member list and total points", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Oak Collective");
    const founderPool = await waitForPool(pageA, (p) => p.memberCount === 1);
    expect(founderPool.totalPoints).toBe("10000");

    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);

    await admitJoiner(pageA, pageB, joinerKey);

    const [poolA, poolB] = await waitForConvergence(
      pageA,
      pageB,
      (a, b) =>
        a.memberCount === 2 &&
        b.memberCount === 2 &&
        a.totalPoints === b.totalPoints &&
        a.members.sort().join() === b.members.sort().join(),
    );

    expect(poolA.totalPoints).toBe(poolB.totalPoints);
    expect(poolA.totalPoints).toBe("10000");
    expect(poolA.memberCount).toBe(2);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("economy & transfers", () => {
  test("transfer redistributes shares and conserves total points", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Trader A", "Trade Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);

    const before = await getPoolSummary(pageA);
    const totalBefore = before!.totalPoints;
    const joiner = before!.members.find((m) => m !== before!.members[0])!;

    await pageA.getByLabel("Send to").selectOption(joiner);
    await pageA.getByLabel("Amount (Points)").fill("1000");
    await pageA.getByRole("button", { name: "Send transaction" }).click();

    await waitForConvergence(
      pageA,
      pageB,
      (a, b) =>
        a.balances[joiner] !== before!.balances[joiner] &&
        a.totalPoints === b.totalPoints,
    );

    const after = await getPoolSummary(pageA);
    expect(after!.totalPoints).toBe(totalBefore);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("governance sliders", () => {
  test("governance slider updates resolved parameters with two members", async ({
    browser,
  }) => {
    const { founder, contexts } = await bootstrapStarCommunity(browser, "Gov Cell", [
      "Bob",
    ]);
    await bridgeUpdateSlider(founder, "decay_rate", 15);
    await waitForPool(founder, (p) => governanceParamNear(p.parameters.decay_rate, 15), 60_000);
    for (const ctx of contexts) {
      await ctx.close();
    }
  });
});

test.describe("epoch & redistribution conservation", () => {
  test("epoch closes and total points are conserved across decay", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Epoch A", "Epoch Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);

    const totalBefore = (await getPoolSummary(pageA))!.totalPoints;

    await bridgeUpdateSlider(pageA, "epoch_interval", 15);
    await bridgeUpdateSlider(pageB, "epoch_interval", 15);
    await pageA.waitForTimeout(2000);

    await bridgeAdvanceCirculation(pageA, joinerKey);
    await pageA.waitForTimeout(2000);

    await waitForPool(pageA, (p) => p.epochNumber >= 1, 60_000);
    const after = await getPoolSummary(pageA);
    expect(after!.totalPoints).toBe(totalBefore);
    expect(after!.epochNumber).toBeGreaterThanOrEqual(1);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("proposals", () => {
  test("resolve_fracture executes after real overspend fracture", async ({ browser }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Prop A", "Proposal Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    const founderKey = await getPublicKey(pageA);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);
    await waitForMemberCount(pageB, 2);

    await pageA.getByLabel("Send to").selectOption(joinerKey);
    await pageA.getByLabel("Amount (Points)").fill("10");
    await pageA.getByRole("button", { name: "Send transaction" }).click();
    await waitForPool(pageB, (p) => p.balances[joinerKey] > 0);

    await pageB.evaluate(
      (to) => window.__aethelosTest?.dispatchDoubleSpend(to, "9999999999999"),
      founderKey,
    );
    await waitForPool(pageA, (p) => (p.fractures ?? []).includes(joinerKey));
    await waitForPool(pageB, (p) => (p.fractures ?? []).includes(joinerKey), 30_000);

    await bridgeCreateProposal(pageA, "resolve_fracture", joinerKey);
    const poolAfter = await waitForPool(
      pageA,
      (p) =>
        (p.proposals ?? []).some((pr) => pr.kind === "resolve_fracture" && !pr.executed),
      60_000,
    );
    const proposalId = poolAfter.proposals!.find(
      (pr) => pr.kind === "resolve_fracture" && !pr.executed,
    )!.id;
    await bridgeVoteProposal(pageA, proposalId, true);

    await waitForPool(
      pageA,
      (p) =>
        (p.proposals ?? []).some(
          (pr) => pr.id === proposalId && pr.kind === "resolve_fracture" && pr.executed,
        ),
      30_000,
    );
    await waitForPool(pageA, (p) => (p.fractures ?? []).length === 0, 30_000);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("invite cancel", () => {
  test("cancel pending invite releases lien without moving points", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Cancel A", "Cancel Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);

    const before = await getPoolSummary(pageA);
    await sendOnChainInvite(pageA, joinerKey);
    await waitForPool(pageA, (p) => p.pendingInviteCount >= 1);

    await pageA.getByRole("button", { name: "Community" }).click();
    await pageA.getByRole("button", { name: "Cancel" }).click();
    await waitForPool(pageA, (p) => p.pendingInviteCount === 0);

    const after = await getPoolSummary(pageA);
    expect(after!.totalPoints).toBe(before!.totalPoints);
    expect(after!.pendingInviteCount).toBe(0);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("sub-Cell depth & linkage", () => {
  test("parent and child Cells link via proposals on both sides", async ({ browser }) => {
    const ctxParent = await freshContext(browser);
    const ctxChild = await freshContext(browser);
    const pageParent = await ctxParent.newPage();
    const pageChild = await ctxChild.newPage();

    await onboardGenesis(pageParent, "Parent Head", "Parent Cell");
    await onboardGenesis(pageChild, "Child Head", "Child Ward");
    await waitForPool(pageParent, (p) => p.memberCount === 1);
    await waitForPool(pageChild, (p) => p.memberCount === 1);

    const parentNs = (await getPoolSummary(pageParent))!.namespaceId;
    const childNs = (await getPoolSummary(pageChild))!.namespaceId;
    expect(parentNs).not.toBe(childNs);

    await pageChild.evaluate(
      (pid) => window.__aethelosTest?.joinSuperstructure(pid),
      parentNs,
    );
    await waitForPool(pageChild, (p) => p.proposalCount >= 1);
    await pageChild.getByRole("button", { name: "Proposals" }).click();
    await pageChild.getByRole("button", { name: "Approve" }).first().click();
    await waitForPool(pageChild, (p) => p.parentSuperstructures.includes(parentNs));

    await pageParent.evaluate((cid) => window.__aethelosTest?.linkSubcell(cid), childNs);
    await pageParent.getByRole("button", { name: "Proposals" }).click();
    await pageParent.getByRole("button", { name: "Approve" }).first().click();
    await waitForPool(pageParent, (p) => (p.childCells ?? []).includes(childNs));

    await ctxParent.close();
    await ctxChild.close();
  });

  test("spawn sub-Cell switches namespace while preserving founder stake", async ({
    page,
  }) => {
    await onboardGenesis(page, "Spawner", "Wide Cell");
    const parent = await waitForPool(page, (p) => p.memberCount === 1);
    const parentNs = parent.namespaceId;
    const parentPoints = parent.totalPoints;

    await page.evaluate(
      (name) => window.__aethelosTest?.spawnSubCell(name),
      "Wide Cell — Ward B",
    );
    await expect(page.getByText("Wide Cell — Ward B")).toBeVisible({ timeout: 30_000 });

    const child = await waitForPool(
      page,
      (p) => p.namespaceId !== parentNs && p.memberCount === 1,
    );
    expect(child.totalPoints).toBe(parentPoints);
    expect(child.cellName).toBe("Wide Cell — Ward B");
  });
});

test.describe("fracture recovery", () => {
  test("overspend causes fracture and is resolved by community proposal", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Safe Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);
    await waitForMemberCount(pageB, 2);

    await pageA.getByLabel("Send to").selectOption(joinerKey);
    await pageA.getByLabel("Amount (Points)").fill("10");
    await pageA.getByRole("button", { name: "Send transaction" }).click();
    await waitForPool(pageB, (p) => p.balances[joinerKey] > 0);

    await pageA.evaluate(
      (bobKey) => window.__aethelosTest?.dispatchDoubleSpend(bobKey, "9999999999999"),
      joinerKey,
    );

    await waitForPool(pageA, (p) => p.fractures.length > 0);
    await waitForPool(pageB, (p) => p.fractures.length > 0, 30_000);

    await pageB.getByRole("button", { name: "Proposals" }).click();
    await expect(pageB.locator(".alert.danger")).toContainText(
      "paused after suspicious activity",
    );
    await pageB.locator("#kind").selectOption("resolve_fracture");
    const aliceKey = await getPublicKey(pageA);
    await pageB.getByLabel("About who?").selectOption(aliceKey);
    await pageB.getByRole("button", { name: "Start proposal" }).click();
    await pageB.getByRole("button", { name: "Approve" }).first().click();

    await waitForPool(pageA, (p) => p.proposalCount >= 2, 30_000);
    await waitForPool(pageA, (p) => p.fractures.length === 0, 30_000);
    await waitForPool(pageB, (p) => p.fractures.length === 0, 30_000);

    await ctxA.close();
    await ctxB.close();
  });

  test("sibling double-spend fork causes fracture and is resolved by community proposal", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Fork Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);
    await waitForMemberCount(pageB, 2);

    await pageA.getByLabel("Send to").selectOption(joinerKey);
    await pageA.getByLabel("Amount (Points)").fill("10");
    await pageA.getByRole("button", { name: "Send transaction" }).click();
    await waitForPool(pageB, (p) => p.balances[joinerKey] > 0);

    // Two signed spends sharing one prevHash tip. Each alone is payable; together
    // the second tripwire fractures (true offline double-spend, not overspend).
    await pageA.evaluate(
      (bobKey) => window.__aethelosTest?.dispatchSiblingDoubleSpend?.(bobKey, "5000"),
      joinerKey,
    );

    await waitForPool(pageA, (p) => p.fractures.length > 0);
    await waitForPool(pageB, (p) => p.fractures.length > 0, 30_000);

    await pageB.getByRole("button", { name: "Proposals" }).click();
    await expect(pageB.locator(".alert.danger")).toContainText(
      "paused after suspicious activity",
    );
    await pageB.locator("#kind").selectOption("resolve_fracture");
    const aliceKey = await getPublicKey(pageA);
    await pageB.getByLabel("About who?").selectOption(aliceKey);
    await pageB.getByRole("button", { name: "Start proposal" }).click();
    await pageB.getByRole("button", { name: "Approve" }).first().click();

    await waitForPool(pageA, (p) => p.proposalCount >= 2, 30_000);
    await waitForPool(pageA, (p) => p.fractures.length === 0, 30_000);
    await waitForPool(pageB, (p) => p.fractures.length === 0, 30_000);

    await ctxA.close();
    await ctxB.close();
  });

  test("joiner double-spend freezes offender UI and founder resolves via proposal", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Charter A Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);
    await waitForMemberCount(pageB, 2);

    await pageA.getByLabel("Send to").selectOption(joinerKey);
    await pageA.getByLabel("Amount (Points)").fill("10");
    await pageA.getByRole("button", { name: "Send transaction" }).click();
    await waitForPool(pageB, (p) => p.balances[joinerKey] > 0);

    const aliceKey = await getPublicKey(pageA);
    await pageB.evaluate(
      (recipient) => window.__aethelosTest?.dispatchSiblingDoubleSpend?.(recipient, "6"),
      aliceKey,
    );

    await waitForPool(pageB, (p) => (p.fractures ?? []).includes(joinerKey));
    await waitForPool(pageA, (p) => (p.fractures ?? []).includes(joinerKey), 30_000);

    await pageB.getByRole("button", { name: "Community" }).click();
    await expect(
      pageB.getByText("Your account is frozen after suspicious activity"),
    ).toBeVisible();
    await expect(pageB.locator(".badge.danger", { hasText: "Frozen" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Send transaction" })).toHaveCount(0);

    await pageA.getByRole("button", { name: "Proposals" }).click();
    await expect(pageA.locator(".alert.danger")).toContainText(
      "paused after suspicious activity",
    );
    await pageA.locator("#kind").selectOption("resolve_fracture");
    await pageA.getByLabel("About who?").selectOption(joinerKey);
    await pageA.getByRole("button", { name: "Start proposal" }).click();
    await pageA.getByRole("button", { name: "Approve" }).first().click();

    await waitForPool(pageA, (p) => p.fractures.length === 0, 30_000);
    await waitForPool(pageB, (p) => p.fractures.length === 0, 30_000);
    await expect(
      pageB.getByText("Your account is frozen after suspicious activity"),
    ).not.toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe("Charter A — new member journey", () => {
  test("invite → blocked before admission → transfer → redistribution visibility", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Charter A Happy Path");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);

    await pageB.getByRole("button", { name: "Community" }).click();
    await expect(pageB.locator(".alert.info").getByText(/step 1 of 4/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(pageB.getByRole("button", { name: "Send transaction" })).toHaveCount(0);

    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);
    await waitForMemberCount(pageB, 2);

    const beforeJoiner = (await getPoolSummary(pageB))!.balances[joinerKey];
    await bridgeTransfer(pageA, joinerKey, "250");
    await waitForPool(
      pageB,
      (p) =>
        parseFloat(p.balances[joinerKey] || "0") > parseFloat(beforeJoiner || "0") + 200,
    );

    const after = await getPoolSummary(pageA);
    const afterJoiner = await getPoolSummary(pageB);
    expect(after!.totalPoints).toBe(afterJoiner!.totalPoints);

    await pageB.getByRole("button", { name: "Governance", exact: true }).click();
    await expect(pageB.getByText("Direct your flow")).toBeVisible();

    await bridgeUpdateSlider(pageA, "epoch_interval", 15);
    await bridgeUpdateSlider(pageB, "epoch_interval", 15);
    await bridgeAdvanceCirculation(pageA, joinerKey);
    await waitForPool(pageA, (p) => p.epochNumber >= 1, 60_000);
    expect((await getPoolSummary(pageA))!.totalPoints).toBe(after!.totalPoints);

    await ctxA.close();
    await ctxB.close();
  });

  test("joiner blocked at step 1 before admission vote", async ({ browser }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Charter A Blocked");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await sendOnChainInvite(pageA, joinerKey);
    await waitForPool(pageA, (p) => p.pendingInviteCount >= 1);

    await pageB.getByRole("button", { name: "Community" }).click();
    await expect(pageB.locator(".alert.info").getByText(/step [23] of 4/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(pageB.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    await waitForPool(pageB, (p) => p.memberCount === 1);

    await ctxA.close();
    await ctxB.close();
  });

  test("after unfreeze offender can transfer again with conservation", async ({
    browser,
  }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardGenesis(pageA, "Alice", "Charter A Unfreeze");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await admitJoiner(pageA, pageB, joinerKey);
    await waitForMemberCount(pageA, 2);

    const aliceKey = await getPublicKey(pageA);
    await pageB.evaluate(
      (recipient) => window.__aethelosTest?.dispatchSiblingDoubleSpend?.(recipient, "6"),
      aliceKey,
    );
    await waitForPool(pageB, (p) => (p.fractures ?? []).includes(joinerKey));

    await pageA.getByRole("button", { name: "Proposals" }).click();
    await pageA.locator("#kind").selectOption("resolve_fracture");
    await pageA.getByLabel("About who?").selectOption(joinerKey);
    await pageA.getByRole("button", { name: "Start proposal" }).click();
    await pageA.getByRole("button", { name: "Approve" }).first().click();
    await waitForPool(pageA, (p) => p.fractures.length === 0, 30_000);
    await waitForPool(pageB, (p) => p.fractures.length === 0, 30_000);

    const totalBefore = (await getPoolSummary(pageA))!.totalPoints;
    await bridgeTransfer(pageB, aliceKey, "5");
    await waitForPool(
      pageA,
      (p) => parseFloat(p.balances[aliceKey] || "0") > 9990,
      30_000,
    );
    const totalAfter = (await getPoolSummary(pageA))!.totalPoints;
    expect(totalAfter).toBe(totalBefore);

    await ctxA.close();
    await ctxB.close();
  });
});
