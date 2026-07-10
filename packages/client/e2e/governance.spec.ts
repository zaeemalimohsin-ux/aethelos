import { test, expect } from "@playwright/test";
import {
  bootstrapStarCommunity,
  waitForMemberCount,
  waitForPool,
  getPublicKey,
} from "./helpers.js";

test.describe("Governance & Fixes", () => {
  test("founder expels joiner after admission", async ({ browser }) => {
    test.setTimeout(180_000);
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Governance Test Mesh",
      ["Bob"],
    );
    const bobPage = joiners[0]!;
    const bobKey = keys[0]!;
    await waitForMemberCount(founder, 2);
    await waitForMemberCount(bobPage, 2);

    await founder.getByRole("button", { name: "Proposals" }).click();
    await founder.locator("#kind").selectOption("expel_member");
    await founder.getByLabel("About who?").selectOption(bobKey);
    await founder.getByRole("button", { name: "Start proposal" }).click();

    await waitForPool(founder, (p) => p.proposalCount >= 1);
    await founder.getByRole("button", { name: "Approve" }).first().click();

    await waitForPool(
      founder,
      (p) => (p.proposals ?? []).some((pr) => pr.kind === "expel_member" && pr.executed),
      60_000,
    );
    await waitForMemberCount(founder, 1, 90_000);
    const pool = await waitForPool(founder, (p) => !p.members.includes(bobKey), 60_000);
    expect(pool.memberCount).toBe(1);

    for (const ctx of contexts) {
      await ctx.close();
    }
  });
});
