import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness";

test.describe("Governance & Fixes", () => {
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

  test("Alice expels Bob", async () => {
    const alicePage = alice.page;
    const bobPage = bob.page;
    test.setTimeout(120000); // 2 minutes max

    // === 1. ALICE BOOTSTRAP ===
    await alicePage.goto("/");
    await alicePage.click('text="Create a new identity"');
    await alicePage.fill('input[placeholder="How others see you"]', "Alice");
    await alicePage.getByLabel("Passphrase", { exact: true }).fill("password123");
    await alicePage.getByLabel("Confirm passphrase").fill("password123");
    await alicePage.click('button:has-text("Create identity")');
    await alicePage.check('input[type="checkbox"]');
    await alicePage.click('button:has-text("Continue")');
    await alicePage.click('button:has-text("Start a new community")');
    await alicePage.getByLabel("Community name").fill("Governance Test Mesh");
    await alicePage.click('button:has-text("Create community")');

    // Get Invite URL from Alice
    await alicePage.click('text="Community"');
    await alicePage.click('button:has-text("Invite people")');
    const inviteTextarea = alicePage.locator(".modal textarea.textarea");
    await inviteTextarea.waitFor();
    const inviteUrl = await inviteTextarea.inputValue();
    await alicePage.keyboard.press("Escape");

    // === 2. BOB JOINS ===
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

    const bobPubkeyCode = bobPage.locator(".join-code-box code.mono");
    await bobPubkeyCode.waitFor();
    const bobPubkey = await bobPubkeyCode.innerText();

    // Alice vouches and approves
    await alicePage.getByRole("button", { name: "Community" }).click();
    await alicePage.getByLabel("Join code").fill(bobPubkey);
    await alicePage.click('button:has-text("Vouch and send invite")');
    await alicePage.click('button.tab:has-text("Proposals")');
    await alicePage
      .locator(".card", { hasText: "Admit member" })
      .locator('button:has-text("Approve")')
      .click();

    // Bob is approved
    await bobPage.click('button:has-text("Accept invitation")');
    await expect(bobPage.locator('button:has-text("Invite people")')).toBeVisible({
      timeout: 30000,
    });

    // === 3. ALICE EXPELS BOB ===
    await alicePage.click('button.tab:has-text("Proposals")');
    await alicePage.locator("#kind").selectOption("expel_member");

    // The UI should show "Member" select dropdown
    await alicePage
      .locator(".card", { hasText: "Propose something" })
      .getByLabel("About who?")
      .selectOption(bobPubkey);
    await alicePage.click('button:has-text("Start proposal")');

    // Alice approves the expel proposal
    await alicePage
      .locator(".card", { hasText: "Remove member" })
      .locator('button:has-text("Approve")')
      .click();

    // Bob should see that he is removed from the community list or his features are restricted
    // Let's verify Bob is removed from Alice's community list
    await alicePage.click('button.tab:has-text("Community")');
    await expect(alicePage.locator(`text="${bobPubkey.slice(0, 12)}…"`)).not.toBeVisible({
      timeout: 15000,
    });
  });
});
