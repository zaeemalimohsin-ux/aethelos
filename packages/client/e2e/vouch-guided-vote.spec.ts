import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness";

test.describe("Guided vouch to vote", () => {
  let alice: PeerDevice;
  let bob: PeerDevice;

  test.beforeAll(async ({ browser }) => {
    alice = await OmniHarness.launchPeer(browser);
    bob = await OmniHarness.launchPeer(browser);
  });

  test.afterAll(async () => {
    await alice.close();
    await bob.close();
  });

  test("vouch navigates to highlighted admit proposal", async () => {
    const alicePage = alice.page;
    const bobPage = bob.page;
    test.setTimeout(120_000);

    await alicePage.goto("/");
    await alicePage.click('text="Create a new identity"');
    await alicePage.fill('input[placeholder="How others see you"]', "Alice");
    await alicePage.getByLabel("Passphrase", { exact: true }).fill("password123");
    await alicePage.getByLabel("Confirm passphrase").fill("password123");
    await alicePage.click('button:has-text("Create identity")');
    await alicePage.check('input[type="checkbox"]');
    await alicePage.click('button:has-text("Continue")');
    await alicePage.click('button:has-text("Start a new community")');
    await alicePage.getByLabel("Community name").fill("Guided Vote Mesh");
    await alicePage.click('button:has-text("Create community")');

    await alicePage.click('button:has-text("Invite people")');
    const inviteTextarea = alicePage.locator(".modal textarea.textarea");
    await inviteTextarea.waitFor();
    const inviteUrl = await inviteTextarea.inputValue();
    await alicePage.keyboard.press("Escape");

    await bobPage.goto("/");
    await bobPage.click('text="I have an invite link"');
    await bobPage.getByLabel("Invite link").fill(inviteUrl);
    await bobPage.click('button:has-text("Continue")');
    await bobPage.fill('input[placeholder="How others see you"]', "Bob");
    await bobPage.getByLabel("Passphrase", { exact: true }).fill("password123");
    await bobPage.getByLabel("Confirm passphrase").fill("password123");
    await bobPage.click('button:has-text("Create identity")');
    await bobPage.check('input[type="checkbox"]');
    await bobPage.click('button:has-text("Continue")');
    await bobPage.click('button:has-text("Join this community")');

    const bobPubkey = await bobPage.locator(".join-code-box code.mono").innerText();

    await alicePage.getByRole("button", { name: "Community" }).click();
    await alicePage.getByLabel("Join code").fill(bobPubkey);
    await alicePage.click('button:has-text("Vouch and send invite")');

    await expect(alicePage.getByRole("button", { name: "Proposals" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const admitRow = alicePage.locator(".proposal-row.proposal-highlight", {
      hasText: "Admit member",
    });
    await expect(admitRow).toBeVisible({ timeout: 15_000 });
    await admitRow.getByRole("button", { name: "Approve" }).click();

    await expect(bobPage.locator(".app-main")).toContainText("Accept invitation", {
      timeout: 30_000,
    });
    await bobPage.click('button:has-text("Accept invitation")');
    await expect(bobPage.locator('button:has-text("Invite people")')).toBeVisible({
      timeout: 30_000,
    });
  });
});
