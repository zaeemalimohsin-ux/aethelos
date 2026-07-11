import { test, expect } from "@playwright/test";
import { generateKeyPair } from "@aethelos/core";
import { encodeInvite, signInvitePayload } from "../src/app/invite.js";
import { submitCreateIdentityForm, ONBOARDING } from "./helpers.js";

async function finishBackupAndOpenJoin(page: import("@playwright/test").Page) {
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(
    page.getByRole("heading", { name: ONBOARDING.startCommunityHeading }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: ONBOARDING.joinCommunityBtn }).click();
}

test("join a community after identity, not on welcome screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: ONBOARDING.createCta })).toBeVisible();
  await expect(
    page.getByRole("button", { name: ONBOARDING.joinCommunityBtn }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: ONBOARDING.createCta }).click();
  await page.getByLabel("Display name").fill("Join Tester");
  await page
    .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
    .fill("supersecret123");
  await page.getByLabel(ONBOARDING.confirmDevicePassphrase).fill("supersecret123");
  await submitCreateIdentityForm(page);
  await finishBackupAndOpenJoin(page);

  const payload = {
    v: 1 as const,
    ns: "test-ns-join-ui",
    inviter: "a".repeat(64),
    cell: "Paste Test Cell",
    relays: ["ws://localhost:8787"],
  };
  const link = `http://localhost:5173/#/join?d=${encodeInvite(payload)}`;
  await page.getByLabel("Invite link").fill(link);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You've been invited")).toBeVisible();
  await expect(page.getByText("Paste Test Cell", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Join this community" })).toBeVisible();
});

test("persists pasted invite in URL across refresh", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: ONBOARDING.createCta }).click();
  await page.getByLabel("Display name").fill("Refresh Tester");
  await page
    .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
    .fill("supersecret123");
  await page.getByLabel(ONBOARDING.confirmDevicePassphrase).fill("supersecret123");
  await submitCreateIdentityForm(page);
  await finishBackupAndOpenJoin(page);

  const payload = {
    v: 1 as const,
    ns: "test-ns-refresh",
    inviter: "b".repeat(64),
    cell: "Refresh Test Cell",
    relays: ["ws://localhost:8787"],
  };
  const link = `http://localhost:5173/#/join?d=${encodeInvite(payload)}`;
  await page.getByLabel("Invite link").fill(link);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You've been invited")).toBeVisible();
  await expect(page).toHaveURL(/#\/join\?d=/);
  await page.reload();
  await expect(page.getByText("You've been invited")).toBeVisible();
  await expect(
    page.getByText("Refresh Test Cell", { exact: true }).first(),
  ).toBeVisible();
});

test("unlock stored identity after refresh with invite hash", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: ONBOARDING.createCta }).click();
  await page.getByLabel("Display name").fill("Unlock Join Tester");
  await page
    .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
    .fill("supersecret123");
  await page.getByLabel(ONBOARDING.confirmDevicePassphrase).fill("supersecret123");
  await submitCreateIdentityForm(page);
  await finishBackupAndOpenJoin(page);

  const payload = {
    v: 1 as const,
    ns: "test-ns-unlock-join",
    inviter: "c".repeat(64),
    cell: "Unlock Join Cell",
    relays: ["ws://localhost:8787"],
  };
  const link = `http://localhost:5173/#/join?d=${encodeInvite(payload)}`;
  await page.getByLabel("Invite link").fill(link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Unlock Join Cell", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("Unlock your identity to join")).toBeVisible();
  await page.getByLabel("Passphrase").fill("supersecret123");
  await page.getByRole("button", { name: "Unlock identity" }).click();
  await expect(page.getByRole("button", { name: "Join this community" })).toBeVisible();
});

test("rejects join when all invite relays are unreachable", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: ONBOARDING.createCta }).click();
  await page.getByLabel("Display name").fill("Probe Tester");
  await page
    .getByLabel(ONBOARDING.devicePassphrase, { exact: true })
    .fill("supersecret123");
  await page.getByLabel(ONBOARDING.confirmDevicePassphrase).fill("supersecret123");
  await submitCreateIdentityForm(page);
  await finishBackupAndOpenJoin(page);

  const kp = await generateKeyPair();
  const payload = await signInvitePayload(
    {
      v: 1,
      ns: "probe-dead-relay-ns",
      inviter: kp.publicKeyHex,
      cell: "Unreachable Mailbox Cell",
      relays: ["ws://127.0.0.1:9/ws"],
    },
    kp,
  );
  const base = process.env.BASE_URL || "http://localhost:5173";
  const link = `${base}/#/join?d=${encodeInvite(payload)}`;
  await page.getByLabel("Invite link").fill(link);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You've been invited")).toBeVisible();
  await page.evaluate(() => window.__aethelosTest?.setForceJoinProbe(true));
  await page.getByRole("button", { name: "Join this community" }).click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "Can't reach the community connection point",
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.evaluate(() => window.__aethelosTest?.getPoolSummary() ?? null),
  ).resolves.toBeNull();
  await expect(page.getByRole("button", { name: "Join this community" })).toBeVisible();
  await page.evaluate(() => window.__aethelosTest?.setForceJoinProbe(false));
});
