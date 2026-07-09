import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness.js";
import { createIdentity, startCommunity } from "./helpers.js";

test.describe("Rejection toast copy", () => {
  let peer: PeerDevice;

  test.beforeEach(async ({ browser }) => {
    peer = await OmniHarness.launchPeer(browser as any);
    const page = peer.page;
    await createIdentity(page, "Founder");
    await startCommunity(page, "Rejection Toast Test");
  });

  test.afterEach(async () => {
    await peer.close();
  });

  test("closed proposal shows mapped copy not raw snake_case", async () => {
    const page = peer.page;
    await page.getByRole("button", { name: "Proposals" }).click();
    await page.locator("#kind").selectOption("link_subcell");
    await page.getByLabel("Community ID", { exact: true }).fill("other_namespace_id");
    await page.getByRole("button", { name: "Start proposal" }).click();

    const row = page.locator(".proposal-row", { hasText: "Link a chapter" });
    await expect(row).toBeVisible();
    const proposalId = await row.getAttribute("data-testid");
    expect(proposalId).toBeTruthy();
    const id = proposalId!.replace("proposal-", "");

    await row.getByRole("button", { name: "Close" }).click();
    await expect(row.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.evaluate(
      async ({ pid }) => {
        await window.__aethelosTest?.voteProposal(pid, true);
      },
      { pid: id },
    );

    await expect(
      page.getByRole("alert").filter({
        hasText: /closed or still syncing/i,
      }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("proposal not open")).toHaveCount(0);
  });
});