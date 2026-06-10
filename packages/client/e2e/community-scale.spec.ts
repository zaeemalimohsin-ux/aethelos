import { test, expect } from "@playwright/test";
import {
  bootstrapStarCommunity,
  waitForAllConvergence,
  waitForMemberCount,
  getPoolSummary,
  waitForPool,
  bridgeTransfer,
  bridgeUpdateSlider,
  bridgeCreateProposal,
  bridgeVoteProposal,
  bridgeVouch,
  closeContexts,
} from "./helpers.js";

test.describe.configure({ timeout: 300_000 });

const SIX = ["Blake", "Casey", "Drew", "Emery", "Finley"];

test.describe("six-member community (UI instances)", () => {
  test("all six nodes converge on identical pool state", async ({ browser }) => {
    const { founder, joiners, contexts } = await bootstrapStarCommunity(
      browser,
      "Hex Collective",
      SIX,
    );
    const pages = [founder, ...joiners];
    const summaries = await waitForAllConvergence(pages, (s) => {
      if (s.length !== 6) return false;
      const first = s[0]!;
      return s.every(
        (p) =>
          p.memberCount === 6 &&
          p.totalPoints === first.totalPoints &&
          p.members.sort().join() === first.members.sort().join(),
      );
    });
    expect(summaries[0]!.totalPoints).toBe("10000");
    await closeContexts(contexts);
  });

  test("stake-weighted governance averages across six voters", async ({ browser }) => {
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Gov Six",
      SIX,
    );
    await waitForMemberCount(founder, 6);

    // Spread stake so governance is not founder-dominated.
    for (let i = 0; i < joiners.length; i++) {
      await bridgeTransfer(founder, keys[i]!, "1200");
    }
    await founder.waitForTimeout(2000);

    await bridgeUpdateSlider(founder, "decay_rate", 10);
    for (const page of joiners) {
      await bridgeUpdateSlider(page, "decay_rate", 40);
    }
    await founder.waitForTimeout(3000);

    const pool = await waitForPool(founder, (p) => p.parameters.decay_rate > 10);
    expect(pool.parameters.decay_rate).toBeGreaterThan(10);
    expect(pool.parameters.decay_rate).toBeLessThanOrEqual(40);
    await closeContexts(contexts);
  });

  test("expel proposal fails when minority stake approves", async ({ browser }) => {
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Vote Six",
      SIX,
    );
    await waitForMemberCount(founder, 6);

    // With liens, founder keeps full balance until transfer — need larger
    // spreads so founder alone cannot pass a 51% expel vote.
    for (let i = 0; i < joiners.length - 1; i++) {
      await bridgeTransfer(founder, keys[i]!, "1300");
    }
    await founder.waitForTimeout(2000);

    const target = keys[keys.length - 1]!;
    await bridgeCreateProposal(founder, "expel_member", target);
    await waitForPool(founder, (p) => p.proposalCount >= 1, 60_000);
    const proposal = (await getPoolSummary(founder))!.proposals!.find(
      (p) => p.kind === "expel_member",
    )!;
    for (let i = 0; i < joiners.length - 1; i++) {
      await bridgeVoteProposal(joiners[i]!, proposal.id, false);
    }
    await bridgeVoteProposal(founder, proposal.id, true);
    await founder.waitForTimeout(3000);

    const after = await getPoolSummary(founder);
    expect(after!.memberCount).toBe(6);
    expect(after!.members).toContain(target);
    await closeContexts(contexts);
  });

  test("head shifts when members vouch for a joiner over founder", async ({ browser }) => {
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Head Six",
      SIX,
    );
    await waitForMemberCount(founder, 6);
    const founderKey = (await getPoolSummary(founder))!.head!;
    const candidate = keys[2]!;

    // Candidate cannot self-vouch; only the other four joiners count toward head score.
    // Need 4 * weight * 100 >= 51% of (10000 * 100) => weight >= 1275.
    for (let i = 0; i < joiners.length; i++) {
      await bridgeTransfer(founder, keys[i]!, "1400");
    }
    await founder.waitForTimeout(2000);

    for (const page of joiners) {
      await bridgeVouch(page, founderKey, 0);
      await bridgeVouch(page, candidate, 100);
    }
    await founder.waitForTimeout(3000);

    const pages = [founder, ...joiners];
    const pool = await waitForAllConvergence(
      pages,
      (summaries) => summaries.every((p) => p.head === candidate),
      90_000,
    );
    expect(pool[0]!.head).toBe(candidate);
    expect(pool[0]!.head).not.toBe(founderKey);
    await closeContexts(contexts);
  });

  test("mesh transfers conserve total points across six wallets", async ({ browser }) => {
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Mesh Six",
      SIX,
    );
    await waitForMemberCount(founder, 6);
    const before = (await getPoolSummary(founder))!.totalPoints;

    await bridgeTransfer(founder, keys[0]!, "500");
    await bridgeTransfer(joiners[0]!, keys[1]!, "200");
    await bridgeTransfer(joiners[1]!, keys[2]!, "100");
    await bridgeTransfer(joiners[2]!, keys[3]!, "50");
    await bridgeTransfer(joiners[3]!, keys[4]!, "25");
    await bridgeTransfer(joiners[4]!, keys[0]!, "10");
    await founder.waitForTimeout(3000);

    const pages = [founder, ...joiners];
    await waitForAllConvergence(pages, (s) => s.every((p) => p.totalPoints === before));
    await closeContexts(contexts);
  });
});
