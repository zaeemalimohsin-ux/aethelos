import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness.js";
import {
  onboardGenesis,
  waitForPool,
  getPoolSummary,
  bridgeVoteProposal,
  bridgeUpdateSlider,
  bootstrapStarCommunity,
  closeContexts,
} from "./helpers.js";

async function linkParentChild(browser: any) {
  const parentPeer = await OmniHarness.launchPeer(browser);
  const childPeer = await OmniHarness.launchPeer(browser);
  const pageParent = parentPeer.page;
  const pageChild = childPeer.page;

  await onboardGenesis(pageParent, "Parent Head", "Parent Federation");
  await waitForPool(pageParent, (p) => p.memberCount === 1);
  await onboardGenesis(pageChild, "Child Head", "Child Federation");
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

  await pageParent.evaluate(
    async ({ cid, bridge }) => {
      await window.__aethelosTest?.linkSubcell(cid, bridge);
    },
    { cid: childNs, bridge: childHead },
  );
  await pageParent.getByRole("button", { name: "Proposals" }).click();
  await pageParent.getByRole("button", { name: "Approve" }).first().click();
  await waitForPool(pageParent, (p) => (p.childCells ?? []).includes(childNs));

  return { parentPeer, childPeer, pageParent, pageChild, parentNs, childNs, childHead };
}

test.describe("federation seam", () => {
  test("bridge_transfer requires approval before escrow release", async ({ browser }) => {
    const { parentPeer, childPeer, pageChild, pageParent, parentNs, childHead } =
      await linkParentChild(browser);

    await pageChild.evaluate(
      async ({ parentNs, childHead }) => {
        await window.__aethelosTest?.bridgeEscrow(parentNs, childHead, "25");
      },
      { parentNs, childHead },
    );
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
    await waitForPool(
      pageChild,
      (p) => {
        const pr = p.proposals?.find((x) => x.kind === "bridge_transfer");
        return pr?.executed === true;
      },
      60_000,
    );

    await parentPeer.close();
    await childPeer.close();
  });

  test("child governance slider relay shifts parent resolved decay_rate", async ({
    browser,
  }) => {
    const { parentPeer, childPeer, pageParent, pageChild } = await linkParentChild(browser);

    const beforeParent = (await getPoolSummary(pageParent))!.parameters.decay_rate;
    await bridgeUpdateSlider(pageChild, "decay_rate", 18);
    await waitForPool(pageChild, (p) => p.parameters.decay_rate === 18);

    await waitForPool(
      pageParent,
      (p) => p.parameters.decay_rate !== beforeParent,
      60_000,
    );
    const afterParent = (await getPoolSummary(pageParent))!.parameters.decay_rate;
    expect(afterParent).toBeGreaterThan(beforeParent);

    await parentPeer.close();
    await childPeer.close();
  });

  test("leave_superstructure clears parent link on child", async ({ browser }) => {
    const { parentPeer, childPeer, pageChild, parentNs } = await linkParentChild(browser);

    await pageChild.evaluate(
      (pid) => window.__aethelosTest?.leaveSuperstructure(pid),
      parentNs,
    );
    await waitForPool(pageChild, (p) => p.proposalCount >= 1);
    await pageChild.getByRole("button", { name: "Proposals" }).click();
    await pageChild.getByRole("button", { name: "Approve" }).first().click();
    await waitForPool(
      pageChild,
      (p) => !p.parentSuperstructures.includes(parentNs),
      60_000,
    );

    await parentPeer.close();
    await childPeer.close();
  });

  test("non-head member proposes join to parent via Proposals UI", async ({ browser }) => {
    test.setTimeout(180_000);
    const parentPeer = await OmniHarness.launchPeer(browser);
    const parentPage = parentPeer.page;
    await onboardGenesis(parentPage, "Parent Head", "Parent Cell");
    await waitForPool(parentPage, (p) => p.memberCount === 1);
    const parentNs = (await getPoolSummary(parentPage))!.namespaceId;

    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Child Cell",
      ["Bob"],
    );
    const bobPage = joiners[0]!;
    const bobKey = keys[0]!;

    const childPool = await waitForPool(founder, (p) => p.memberCount === 2);
    expect(childPool.head).not.toBe(bobKey);

    await bobPage.getByRole("button", { name: "Proposals" }).click();
    await bobPage.getByText("Advanced: link chapters").click();
    await bobPage.getByLabel("Parent community ID").fill(parentNs);
    await bobPage.getByRole("button", { name: "Propose join to parent" }).click();
    await expect(bobPage.getByText("Join superstructure proposal created")).toBeVisible({
      timeout: 15_000,
    });

    await waitForPool(
      bobPage,
      (p) => (p.proposals ?? []).some((x) => x.kind === "join_superstructure"),
      60_000,
    );
    const joinProposal = (await getPoolSummary(bobPage))!.proposals!.find(
      (p) => p.kind === "join_superstructure",
    )!;
    await bridgeVoteProposal(founder, joinProposal.id, true);
    await bridgeVoteProposal(bobPage, joinProposal.id, true);

    await waitForPool(
      bobPage,
      (p) => p.parentSuperstructures.includes(parentNs),
      60_000,
    );

    await parentPeer.close();
    await closeContexts(contexts);
  });

  test("event log export and import conserve pool summary", async ({ browser }) => {
    const peer = await OmniHarness.launchPeer(browser);
    const page = peer.page;
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
