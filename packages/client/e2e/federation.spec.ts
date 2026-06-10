import { test, expect } from "@playwright/test";
import {
  freshContext,
  onboardGenesis,
  waitForPool,
  getPoolSummary,
  bridgeVoteProposal,
  bridgeUpdateSlider,
  closeContexts,
} from "./helpers.js";

async function linkParentChild(
  browser: { newContext: (opts?: object) => Promise<import("@playwright/test").BrowserContext> },
) {
  const ctxParent = await freshContext(browser);
  const ctxChild = await freshContext(browser);
  const pageParent = await ctxParent.newPage();
  const pageChild = await ctxChild.newPage();

  await onboardGenesis(pageParent, "Parent Head", "Parent Federation");
  await onboardGenesis(pageChild, "Child Head", "Child Federation");
  await waitForPool(pageParent, (p) => p.memberCount === 1);
  await waitForPool(pageChild, (p) => p.memberCount === 1);

  const parentNs = (await getPoolSummary(pageParent))!.namespaceId;
  const childNs = (await getPoolSummary(pageChild))!.namespaceId;
  const childHead = (await getPoolSummary(pageChild))!.head!;

  await pageChild.evaluate(async (pid) => {
    await window.__aethelosTest?.joinSuperstructure(pid);
  }, parentNs);
  await waitForPool(pageChild, (p) => p.proposalCount >= 1);
  await pageChild.getByRole("button", { name: "Proposals" }).click();
  await pageChild.getByRole("button", { name: "Approve" }).first().click();
  await waitForPool(pageChild, (p) => p.parentSuperstructures.includes(parentNs));

  await pageParent.evaluate(async ({ cid, bridge }) => {
    await window.__aethelosTest?.linkSubcell(cid, bridge);
  }, { cid: childNs, bridge: childHead });
  await pageParent.getByRole("button", { name: "Proposals" }).click();
  await pageParent.getByRole("button", { name: "Approve" }).first().click();
  await waitForPool(pageParent, (p) => (p.childCells ?? []).includes(childNs));

  return { ctxParent, ctxChild, pageParent, pageChild, parentNs, childNs, childHead };
}

test.describe("federation seam", () => {
  test("bridge_transfer requires approval before escrow release", async ({ browser }) => {
    const { ctxParent, ctxChild, pageChild, pageParent, parentNs, childHead } =
      await linkParentChild(browser);

    await pageChild.evaluate(async ({ parentNs, childHead }) => {
      await window.__aethelosTest?.bridgeEscrow(parentNs, childHead, "25");
    }, { parentNs, childHead });
    await waitForPool(pageChild, (p) => p.proposalCount >= 1, 30_000);
    const proposal = (await getPoolSummary(pageChild))!.proposals!.find(
      (p) => p.kind === "bridge_transfer",
    )!;
    expect(proposal.executed).toBe(false);

    await bridgeVoteProposal(pageChild, proposal.id, false);
    await pageChild.waitForTimeout(1500);
    const pool = await getPoolSummary(pageChild);
    expect(pool!.proposals!.find((p) => p.id === proposal.id)?.executed).toBe(false);

    await bridgeVoteProposal(pageChild, proposal.id, true);
    await waitForPool(pageChild, (p) => {
      const pr = p.proposals?.find((x) => x.kind === "bridge_transfer");
      return pr?.executed === true;
    }, 60_000);

    await closeContexts([ctxParent, ctxChild]);
  });

  test("child governance slider relay shifts parent resolved decay_rate", async ({ browser }) => {
    const { ctxParent, ctxChild, pageParent, pageChild } = await linkParentChild(browser);

    const beforeParent = (await getPoolSummary(pageParent))!.parameters.decay_rate;
    await bridgeUpdateSlider(pageChild, "decay_rate", 18);
    await waitForPool(pageChild, (p) => p.parameters.decay_rate === 18);

    await waitForPool(pageParent, (p) => p.parameters.decay_rate !== beforeParent, 60_000);
    const afterParent = (await getPoolSummary(pageParent))!.parameters.decay_rate;
    expect(afterParent).toBeGreaterThan(beforeParent);

    await closeContexts([ctxParent, ctxChild]);
  });

  test("leave_superstructure clears parent link on child", async ({ browser }) => {
    const { ctxParent, ctxChild, pageChild, parentNs } = await linkParentChild(browser);

    await pageChild.evaluate((pid) => window.__aethelosTest?.leaveSuperstructure(pid), parentNs);
    await waitForPool(pageChild, (p) => p.proposalCount >= 1);
    await pageChild.getByRole("button", { name: "Proposals" }).click();
    await pageChild.getByRole("button", { name: "Approve" }).first().click();
    await waitForPool(pageChild, (p) => !p.parentSuperstructures.includes(parentNs), 60_000);

    await closeContexts([ctxParent, ctxChild]);
  });

  test("event log export and import conserve pool summary", async ({ page }) => {
    await onboardGenesis(page, "Exporter", "Log Cell");
    await waitForPool(page, (p) => p.memberCount === 1);

    const before = await getPoolSummary(page);
    const log = await page.evaluate(() => window.__aethelosTest!.exportLog());
    await page.evaluate((json) => window.__aethelosTest!.importLog(json), log);
    await page.waitForTimeout(1500);

    const after = await getPoolSummary(page);
    expect(after!.totalPoints).toBe(before!.totalPoints);
    expect(after!.memberCount).toBe(before!.memberCount);
  });
});
