import { test, expect } from '@playwright/test';
import { OmniHarness, PeerDevice } from './harness';

test.describe('AethelOS Multi-Peer Mesh E2E', () => {
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

  test('Alice creates community, Bob joins, Alice vouches, Bob participates', async () => {
    const alicePage = alice.page;
    const bobPage = bob.page;
    test.setTimeout(120000); // This is a long multi-peer test

    // === 1. ALICE BOOTSTRAP ===
    await alicePage.goto('/');
    await alicePage.click('text="Create a new identity"');
    await alicePage.fill('input[placeholder="How others see you"]', 'Alice (Peer 1)');
    await alicePage.getByLabel('Passphrase', { exact: true }).fill('password123');
    await alicePage.getByLabel('Confirm passphrase').fill('password123');
    await alicePage.click('button:has-text("Create identity")');
    await alicePage.check('input[type="checkbox"]');
    await alicePage.click('button:has-text("Continue")');
    await alicePage.click('button:has-text("Start a new community")');
    await alicePage.getByLabel('Community name').fill('Alice Test Mesh');
    await alicePage.click('button:has-text("Create community")');
    
    // Verify Alice's community loaded
    await expect(alicePage.locator('.app-header')).toContainText('Alice Test Mesh');

    // Get Invite URL from Alice
    await alicePage.click('text="Community"');
    await alicePage.click('button:has-text("Invite people")');
    // Wait for the textarea in the modal
    const inviteTextarea = alicePage.locator('.modal textarea.textarea');
    await inviteTextarea.waitFor();
    const inviteUrl = await inviteTextarea.inputValue();
    
    // Close modal
    await alicePage.keyboard.press('Escape');

    // === 2. BOB JOINS ===
    await bobPage.goto('/');
    await bobPage.click('text="I have an invite link"');
    await bobPage.getByLabel('Invite link').fill(inviteUrl);
    await bobPage.click('button:has-text("Continue")');
    
    // Bob needs an identity first (auto-transitions to Create Identity screen)
    await expect(bobPage.locator('.card')).toContainText('Create your identity');
    await bobPage.fill('input[placeholder="How others see you"]', 'Bob (Peer 2)');
    await bobPage.getByLabel('Passphrase', { exact: true }).fill('password123');
    await bobPage.getByLabel('Confirm passphrase').fill('password123');
    await bobPage.click('button:has-text("Create identity")');
    await bobPage.check('input[type="checkbox"]');
    await bobPage.click('button:has-text("Continue")');
    
    // NOW Bob sees the invite join screen
    await expect(bobPage.locator('.card')).toContainText("You've been invited");
    await expect(bobPage.locator('.card')).toContainText('Alice Test Mesh');
    
    // Bob clicks Join
    await bobPage.click('button:has-text("Join this community")');

    // Bob is now in "Waiting" state
    await expect(bobPage.locator('.app-header')).toContainText('Alice Test Mesh');
    await bobPage.click('text="Community"');
    await expect(bobPage.locator('.app-main')).toContainText('Waiting to be welcomed in');

    // Extract Bob's pubkey
    const bobPubkeyCode = bobPage.locator('.join-code-box code.mono');
    await bobPubkeyCode.waitFor();
    const bobPubkey = await bobPubkeyCode.innerText();

    // === 3. ALICE VOUCHES FOR BOB ===
    // In Alice's Community tab
    await alicePage.click('text=Someone opened your link');
    await alicePage.getByLabel('Join code').fill(bobPubkey);
    await alicePage.click('button:has-text("Vouch and send invite")');

    // === 3.5. ALICE VOTES ON ADMISSION ===
    // Alice must vote to admit Bob
    await alicePage.click('button.tab:has-text("Proposals")');
    // The admission proposal is for Bob. We click Approve.
    await alicePage.locator('.card', { hasText: 'Admit member' }).locator('button:has-text("Approve")').click();
    // === 4. BOB IS ADMITTED ===
    // Bob's UI should dynamically update via pubsub!
    await expect(bobPage.locator('.app-main')).toContainText("You're approved — welcome in!", { timeout: 30000 });
    await bobPage.click('button:has-text("Accept invitation")');
    
    // Bob should see Invite people button now
    await expect(bobPage.locator('button:has-text("Invite people")')).toBeVisible({ timeout: 30000 });

    // Alice and Bob are now both members
  });
});
