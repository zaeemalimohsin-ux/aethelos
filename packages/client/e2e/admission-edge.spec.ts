import { test, expect } from "@playwright/test";
import { generateKeyPair } from "@aethelos/core";
import { encodeInvite, signInvitePayload } from "../src/app/invite.js";
import {
  onboardGenesis,
  buildInviteLink,
  joinViaInviteLink,
  getPublicKey,
  freshContext,
  waitForPool,
  sendOnChainInvite,
  createIdentity,
  RELAY_URL,
  PASSWORD,
} from "./helpers.js";

const BASE = process.env.BASE_URL || "http://localhost:5173";

async function joinWithCustomLink(
  page: import("@playwright/test").Page,
  link: string,
  displayName = "Edge Joiner",
): Promise<void> {
  await page.goto(link);
  await page.reload();
  await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Create identity" }).click();
  await createIdentity(page, displayName, { fromInvite: true });
  await page.getByRole("button", { name: "Join this community" }).click();
}

test.describe("admission security edges", () => {
  test("unsigned invite blocks join", async ({ page }) => {
    const payload = {
      v: 1 as const,
      ns: "unsigned-ns",
      inviter: "a".repeat(64),
      cell: "Unsigned Cell",
      relays: [RELAY_URL],
    };
    const link = `${BASE}#/join?d=${encodeInvite(payload)}`;
    await joinWithCustomLink(page, link);
    await expect(
      page.getByRole("alert").filter({ hasText: /unsigned invite link/i }),
    ).toBeVisible({ timeout: 10_000 });
    const pool = await page.evaluate(
      () => window.__aethelosTest?.getPoolSummary() ?? null,
    );
    expect(pool).toBeNull();
  });

  test("tampered signed invite blocks join", async ({ page }) => {
    const kp = await generateKeyPair();
    const signed = await signInvitePayload(
      {
        v: 1,
        ns: "tamper-ns",
        inviter: kp.publicKeyHex,
        cell: "Tamper Cell",
        relays: [RELAY_URL],
      },
      kp,
    );
    const tampered = { ...signed, relays: ["ws://evil.example/ws"] };
    const link = `${BASE}#/join?d=${encodeInvite(tampered)}`;
    await joinWithCustomLink(page, link);
    await expect(
      page.getByRole("alert").filter({ hasText: /signature is invalid/i }),
    ).toBeVisible({ timeout: 10_000 });
    const pool = await page.evaluate(
      () => window.__aethelosTest?.getPoolSummary() ?? null,
    );
    expect(pool).toBeNull();
  });

  test("accept before admission approved is blocked", async ({ browser }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await onboardGenesis(pageA, "Founder", "Admission Edge Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await sendOnChainInvite(pageA, joinerKey);
    await waitForPool(pageA, (p) => p.pendingInviteCount >= 1);
    await pageB.evaluate(async () => {
      await window.__aethelosTest?.acceptPendingInvite();
    });
    await expect(
      pageB.locator(".alert.info").getByText(/step 3 of 4.*Community voting/i),
    ).toBeVisible({ timeout: 10_000 });
    await waitForPool(pageB, (p) => p.memberCount === 1);
    const approvedEarly = await pageB.evaluate(() =>
      window.__aethelosTest?.isAdmissionApproved(),
    );
    expect(approvedEarly).toBe(false);
    await ctxA.close();
    await ctxB.close();
  });

  test("reload preserves admission voting step before approval", async ({ browser }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await onboardGenesis(pageA, "Founder", "Reload Step Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await sendOnChainInvite(pageA, joinerKey);
    await waitForPool(pageA, (p) => p.pendingInviteCount >= 1);
    await pageB.getByRole("button", { name: "Community" }).click();
    await waitForPool(
      pageB,
      (p) => (p.proposals ?? []).some((pr) => pr.kind === "admit_member" && !pr.executed),
      60_000,
    );
    await expect(pageB.locator(".alert.info").getByText(/step [23] of 4/i)).toBeVisible({
      timeout: 30_000,
    });

    await pageB.reload();
    await pageB.getByLabel("Passphrase").fill(PASSWORD);
    await pageB.getByRole("button", { name: "Unlock" }).click();
    await expect(pageB.getByText(/Reload Step Cell/)).toBeVisible({ timeout: 30_000 });
    await waitForPool(
      pageB,
      (p) =>
        p.memberCount === 1 &&
        (p.proposals ?? []).some((pr) => pr.kind === "admit_member" && !pr.executed),
      60_000,
    );
    await pageB.getByRole("button", { name: "Community" }).click();
    await expect(
      pageB.locator(".alert.info").filter({ hasText: /Waiting to join/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(pageB.locator(".alert.info").getByText(/step [123] of 4/i)).toBeVisible({
      timeout: 30_000,
    });
    const approved = await pageB.evaluate(() =>
      window.__aethelosTest?.isAdmissionApproved(),
    );
    expect(approved).toBe(false);
    await ctxA.close();
    await ctxB.close();
  });

  test("vouch only — no Accept invitation button", async ({ browser }) => {
    const ctxA = await freshContext(browser);
    const ctxB = await freshContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await onboardGenesis(pageA, "Founder", "Vouch Only Cell");
    const inviteLink = await buildInviteLink(pageA);
    await joinViaInviteLink(pageB, inviteLink);
    const joinerKey = await getPublicKey(pageB);
    await sendOnChainInvite(pageA, joinerKey);
    await waitForPool(pageA, (p) => p.pendingInviteCount >= 1);
    await pageB.getByRole("button", { name: "Community" }).click();
    await waitForPool(
      pageB,
      (p) => (p.proposals ?? []).some((pr) => pr.kind === "admit_member" && !pr.executed),
      60_000,
    );
    await expect(pageB.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    await ctxA.close();
    await ctxB.close();
  });
});
