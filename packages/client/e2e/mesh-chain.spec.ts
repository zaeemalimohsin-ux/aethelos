import { test, expect } from "@playwright/test";
import {
  bootstrapStarCommunity,
  waitForMemberCount,
  waitForPool,
  getPublicKey,
} from "./helpers.js";

test.describe("mesh chain admission", () => {
  test("three-member sequential join chain converges", async ({ browser }) => {
    test.setTimeout(300_000);
    const { founder, joiners, keys, contexts } = await bootstrapStarCommunity(
      browser,
      "Mesh Chain Cell",
      ["Bob", "Charlie"],
    );
    await waitForMemberCount(founder, 3, 120_000);
    await waitForMemberCount(joiners[0]!, 3, 120_000);
    await waitForMemberCount(joiners[1]!, 3, 120_000);

    const founderPool = await waitForPool(founder, (p) => p.memberCount === 3);
    const bobKey = keys[0]!;
    const charlieKey = keys[1]!;
    expect(founderPool.members).toContain(bobKey);
    expect(founderPool.members).toContain(charlieKey);

    for (const ctx of contexts) {
      await ctx.close();
    }
  });
});
