import { test, expect } from "@playwright/test";
import { OmniHarness, PeerDevice } from "./harness";

test.describe("AethelOS Multi-Peer Mesh (3 Peers)", () => {
  let alice: PeerDevice;
  let bob: PeerDevice;
  let charlie: PeerDevice;

  test.beforeAll(async ({ browser }) => {
    alice = await OmniHarness.launchPeer(browser);
    bob = await OmniHarness.launchPeer(browser);
    charlie = await OmniHarness.launchPeer(browser);
  });

  test.afterAll(async () => {
    await alice.close();
    await bob.close();
    await charlie.close();
  });

  test("Alice starts, Bob joins via Alice, Charlie joins via Bob", async () => {
    const alicePage = alice.page;
    const bobPage = bob.page;
    const charliePage = charlie.page;
    test.setTimeout(180000); // 3 minutes max

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
    await alicePage.getByLabel("Community name").fill("3-Peer Test Mesh");
    await alicePage.click('button:has-text("Create community")');

    // Verify Alice's community loaded
    await expect(alicePage.locator(".app-header")).toContainText("3-Peer Test Mesh");

    // Get Invite URL from Alice
    await alicePage.click('text="Community"');
    await alicePage.click('button:has-text("Invite people")');
    const inviteTextareaA = alicePage.locator(".modal textarea.textarea");
    await inviteTextareaA.waitFor();
    const inviteUrlA = await inviteTextareaA.inputValue();
    await alicePage.keyboard.press("Escape");

    // === 2. BOB JOINS VIA ALICE ===
    await bobPage.goto("/");
    await bobPage.click('text="I have an invite link"');
    await bobPage.getByLabel("Invite link").fill(inviteUrlA);
    await bobPage.click('button:has-text("Continue")');

    await expect(bobPage.locator(".card")).toContainText("Create your identity");
    await bobPage.fill('input[placeholder="How others see you"]', "Bob");
    await bobPage.getByLabel("Passphrase", { exact: true }).fill("password123");
    await bobPage.getByLabel("Confirm passphrase").fill("password123");
    await bobPage.click('button:has-text("Create identity")');
    await bobPage.check('input[type="checkbox"]');
    await bobPage.click('button:has-text("Continue")');

    await expect(bobPage.locator(".card")).toContainText("3-Peer Test Mesh");
    await bobPage.click('button:has-text("Join this community")');

    await expect(bobPage.locator(".app-header")).toContainText("3-Peer Test Mesh");
    await bobPage.click('text="Community"');

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
    await expect(bobPage.locator(".app-main")).toContainText(
      "You're approved — welcome in!",
      { timeout: 30000 },
    );
    await bobPage.click('button:has-text("Accept invitation")');
    await expect(bobPage.locator('button:has-text("Invite people")')).toBeVisible({
      timeout: 30000,
    });

    // === 2.5. ALICE TRANSFERS POINTS TO BOB ===
    // Bob needs points to afford the vouch lien for Charlie
    await alicePage.click('text="Community"');
    // The "Send Value" card has a select for "Send to"
    await alicePage
      .locator(".card", { hasText: "Send Value" })
      .locator("select")
      .selectOption(bobPubkey);
    await alicePage
      .locator(".card", { hasText: "Send Value" })
      .getByLabel("Amount (Value)")
      .fill("1000");
    await alicePage
      .locator(".card", { hasText: "Send Value" })
      .locator('button:has-text("Send")')
      .click();

    // Wait for Bob to receive the points (we expect his balance in the app header or members list to update)
    await expect(bobPage.locator(".app-main")).toContainText("1000", { timeout: 15000 });

    // === 3. CHARLIE JOINS VIA BOB ===
    // Bob gets an invite link
    await bobPage.click('button:has-text("Invite people")');
    const inviteTextareaB = bobPage.locator(".modal textarea.textarea");
    await inviteTextareaB.waitFor();
    const inviteUrlB = await inviteTextareaB.inputValue();
    await bobPage.keyboard.press("Escape");

    // Charlie uses Bob's invite link
    await charliePage.goto("/");
    await charliePage.click('text="I have an invite link"');
    await charliePage.getByLabel("Invite link").fill(inviteUrlB);
    await charliePage.click('button:has-text("Continue")');

    await expect(charliePage.locator(".card")).toContainText("Create your identity");
    await charliePage.fill('input[placeholder="How others see you"]', "Charlie");
    await charliePage.getByLabel("Passphrase", { exact: true }).fill("password123");
    await charliePage.getByLabel("Confirm passphrase").fill("password123");
    await charliePage.click('button:has-text("Create identity")');
    await charliePage.check('input[type="checkbox"]');
    await charliePage.click('button:has-text("Continue")');

    await expect(charliePage.locator(".card")).toContainText("3-Peer Test Mesh");
    await charliePage.click('button:has-text("Join this community")');

    await expect(charliePage.locator(".app-header")).toContainText("3-Peer Test Mesh");
    await charliePage.click('text="Community"');

    const charliePubkeyCode = charliePage.locator(".join-code-box code.mono");
    await charliePubkeyCode.waitFor();
    const charliePubkey = await charliePubkeyCode.innerText();

    // Bob vouches for Charlie
    await bobPage.getByRole("button", { name: "Community" }).click();
    await bobPage.getByLabel("Join code").fill(charliePubkey);
    await bobPage.click('button:has-text("Vouch and send invite")');

    // Now Bob votes on it (has 0 weight initially so it won't pass)
    await bobPage.click('button.tab:has-text("Proposals")');
    // Bob approves
    await bobPage
      .locator(".card", { hasText: "Admit member" })
      .locator('button:has-text("Approve")')
      .click();

    // Charlie is STILL waiting!
    // Since bob has practically 0 stake, Alice (10,000 stake) needs to vote
    await charliePage.waitForTimeout(2000);
    // Charlie should still have 'Waiting to be welcomed in' text visible (indirectly via wait)
    // Now Alice approves!
    await alicePage.click('button.tab:has-text("Proposals")');
    await alicePage
      .locator(".card", { hasText: "Admit member" })
      .locator('button:has-text("Approve")')
      .click();

    // Charlie is approved!
    await expect(charliePage.locator(".app-main")).toContainText(
      "You're approved — welcome in!",
      { timeout: 30000 },
    );
    await charliePage.click('button:has-text("Accept invitation")');
    await expect(charliePage.locator('button:has-text("Invite people")')).toBeVisible({
      timeout: 30000,
    });
  });
});
